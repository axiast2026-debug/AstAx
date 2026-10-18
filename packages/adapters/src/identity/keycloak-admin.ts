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

/** A login event kept by Keycloak (phase 8: imported into the audit log). */
export interface KeycloakEvent {
  time: number;
  type: string;
  clientId?: string;
  userId?: string;
  ipAddress?: string;
  error?: string;
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

  /** Names of the realm roles assigned to a user (e.g. astax-private, astax-professional). */
  async realmRoles(userId: string): Promise<string[]> {
    const roles = await this.call<{ name: string }[]>(
      "realmRoles",
      "GET",
      `/users/${userId}/role-mappings/realm`,
    );
    return roles.map((r) => r.name);
  }

  /** Removes every credential of a type (e.g. "otp"), as when the administrator resets the second factor. */
  async removeCredentials(userId: string, type: string): Promise<number> {
    const credentials = await this.call<{ id: string; type: string }[]>(
      "listCredentials",
      "GET",
      `/users/${userId}/credentials`,
    );
    const matching = credentials.filter((c) => c.type === type);
    for (const credential of matching) {
      await this.call(
        "removeCredential",
        "DELETE",
        `/users/${userId}/credentials/${credential.id}`,
      );
    }
    return matching.length;
  }

  async logoutUser(userId: string): Promise<void> {
    await this.call("logoutUser", "POST", `/users/${userId}/logout`);
  }

  /**
   * Keycloak emails the user a link to perform the given actions (set the
   * password, configure TOTP), then sends them to `redirectUri`.
   */
  async executeActionsEmail(
    userId: string,
    actions: string[],
    options: { clientId: string; redirectUri: string; lifespanSeconds: number },
  ): Promise<void> {
    const query = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      lifespan: String(options.lifespanSeconds),
    });
    await this.call(
      "executeActionsEmail",
      "PUT",
      `/users/${userId}/execute-actions-email?${query}`,
      actions,
    );
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

  /**
   * Login events from `sinceMs` on, oldest first. Keycloak filters by day, so
   * the time is checked here too.
   */
  async listEvents(types: string[], sinceMs: number, max = 500): Promise<KeycloakEvent[]> {
    const query = new URLSearchParams({
      dateFrom: new Date(sinceMs).toISOString().slice(0, 10),
      first: "0",
      max: String(max),
    });
    for (const type of types) query.append("type", type);
    const events = await this.call<KeycloakEvent[]>("listEvents", "GET", `/events?${query}`);
    return events.filter((e) => e.time > sinceMs).sort((a, b) => a.time - b.time);
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
