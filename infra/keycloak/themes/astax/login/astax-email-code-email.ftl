<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
  <#if section = "header">
    ${msg("astaxEmailCodeTitle")}
  <#elseif section = "form">
    <p>${msg("astaxEmailCodeIntro")}</p>
    <form id="kc-email-code-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
      <div class="${properties.kcFormGroupClass!}">
        <label for="email" class="${properties.kcLabelClass!}">${msg("email")}</label>
        <input id="email" name="email" type="email" autocomplete="email" autofocus required
               class="${properties.kcInputClass!}" />
      </div>
      <div class="${properties.kcFormGroupClass!}">
        <input id="kc-email-code-send" type="submit" value="${msg("astaxEmailCodeSend")}"
               class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" />
      </div>
    </form>
  </#if>
</@layout.registrationLayout>
