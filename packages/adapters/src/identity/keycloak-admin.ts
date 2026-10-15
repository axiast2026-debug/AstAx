/**
 * Minimal client of the Keycloak admin REST API, used by the API with its own
 * service account (astax-api-admin). Errors carry status codes and paths only,
 * never request bodies, tokens or user data (SIC-06).
 */
export interface KeycloakAdminOptions {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  /** Injected in tests. */
  fetch?: typeof fetch;
  /** Milliseconds since epoch, from the Clock: decides when to renew the token. */
  now: () => number;
}

export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  enabled: boolean;
  requiredActions?: string[];
}

export interface KeycloakSession {
  id: string;
  ipAddress?: string;
  start: number;
  lastAccess: number;
  clients: Record<string, string>;
}

export class KeycloakAdminError extends Error {
  constructor(
    readonly status: number,
    readonly operation: string,
  ) {
    super(`Keycloak admin ${operation} failed with status ${status}`);
    this.name = "KeycloakAdminError";
  }
}

export class KeycloakAdmin {
  #token: { value: string; expiresAt: number } | undefined;
  readonly #fetch: typeof fetch;

  constructor(private readonly options: KeycloakAdminOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  get realmUrl(): string {
    return `${this.options.baseUrl}/admin/realms/${this.options.realm}`;
  }

  private async token(): Promise<string> {
    if (this.#token && this.#token.expiresAt > this.options.now() + 10_000)
      return this.#token.value;
    const response = await this.#fetch(
      `${this.options.baseUrl}/realms/${this.options.realm}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
        }),
      },
    );
    if (!response.ok) throw new KeycloakAdminError(response.status, "token");
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.#token = {
      value: body.access_token,
      expiresAt: this.options.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }

  private async call<T>(
    operation: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.#fetch(`${this.realmUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new KeycloakAdminError(response.status, operation);
    if (response.status === 201)
      return (response.headers.get("location")?.split("/").pop() ?? "") as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async findUserByEmail(email: string): Promise<KeycloakUser | undefined> {
    const users = await this.call<KeycloakUser[]>(
      "findUserByEmail",
      "GET",
      `/users?exact=true&email=${encodeURIComponent(email)}`,
    );
    return users[0];
  }

  /** Creates a user and returns its id. */
  async createUser(user: {
    email: string;
    firstName: string;
    lastName: string;
    requiredActions?: string[];
  }): Promise<string> {
    return this.call<string>("createUser", "POST", "/users", {
      username: user.email,
      email: user.email,
      emailVerified: true,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: true,
      requiredActions: user.requiredActions ?? [],
    });
  }

  async setPassword(userId: string, password: string, temporary: boolean): Promise<void> {
    await this.call("setPassword", "PUT", `/users/${userId}/reset-password`, {
      type: "password",
      value: password,
      temporary,
    });
  }

  async addRealmRoles(userId: string, roleNames: string[]): Promise<void> {
    const roles = await Promise.all(
      roleNames.map((name) =>
        this.call<{ id: string; name: string }>("getRole", "GET", `/roles/${name}`),
      ),
    );
    await this.call("addRealmRoles", "POST", `/users/${userId}/role-mappings/realm`, roles);
  }

  async setEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.call("setEnabled", "PUT", `/users/${userId}`, { enabled });
  }

  async listSessions(userId: string): Promise<KeycloakSession[]> {
    return this.call<KeycloakSession[]>("listSessions", "GET", `/users/${userId}/sessions`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.call("deleteSession", "DELETE", `/sessions/${sessionId}`);
  }

  async logoutUser(userId: string): Promise<void> {
    await this.call("logoutUser", "POST", `/users/${userId}/logout`);
  }

  /** Updates attributes of a client found by clientId (e.g. session timeouts). */
  async updateClientAttributes(
    clientId: string,
    attributes: Record<string, string>,
  ): Promise<void> {
    const [client] = await this.call<{ id: string; attributes?: Record<string, string> }[]>(
      "findClient",
      "GET",
      `/clients?clientId=${encodeURIComponent(clientId)}`,
    );
    if (!client) throw new KeycloakAdminError(404, "findClient");
    await this.call("updateClient", "PUT", `/clients/${client.id}`, {
      attributes: { ...client.attributes, ...attributes },
    });
  }

  async updateRealm(settings: Record<string, unknown>): Promise<void> {
    await this.call("updateRealm", "PUT", "", settings);
  }

  async updateAuthenticatorConfig(
    id: string,
    alias: string,
    config: Record<string, string>,
  ): Promise<void> {
    await this.call("updateAuthenticatorConfig", "PUT", `/authentication/config/${id}`, {
      id,
      alias,
      config,
    });
  }
}
