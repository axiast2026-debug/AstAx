<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
  <#if section = "header">
    ${msg("astaxEmailCodeCodeTitle")}
  <#elseif section = "form">
    <p>${msg("astaxEmailCodeSent", (email!""))}</p>
    <form id="kc-email-code-verify" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
      <div class="${properties.kcFormGroupClass!}">
        <label for="code" class="${properties.kcLabelClass!}">${msg("astaxEmailCodeLabel")}</label>
        <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" autofocus required
               class="${properties.kcInputClass!}" />
      </div>
      <div class="${properties.kcFormGroupClass!}">
        <input id="kc-email-code-login" type="submit" value="${msg("doLogIn")}"
               class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" />
      </div>
    </form>
    <form action="${url.loginAction}" method="post">
      <input type="hidden" name="restart" value="true" />
      <input id="kc-email-code-restart" type="submit" value="${msg("astaxEmailCodeRestart")}"
             class="${properties.kcButtonClass!} ${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}" />
    </form>
  </#if>
</@layout.registrationLayout>
