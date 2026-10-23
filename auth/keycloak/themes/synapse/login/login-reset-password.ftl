<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true; section>
   
    <#if section = "title">
        ${msg("emailForgotTitle")?no_esc}
    <#elseif section = "header">
        ${msg("emailForgotTitle")?no_esc}
    <#elseif section = "form">

    <header class="op-card__head">
        <h1 class="op-card__title">${msg("doForgotPassword")?no_esc}</h1>
        <p class="op-card__sub">${msg("doForgotPasswordSublabel")?no_esc}</p>
    </header>

   <form style="margin:auto" id="kc-reset-password-form" action="${url.loginAction}" method="post">
        <div class="ops-field enteremail-input <#if usernameEditDisabled??>mdc-text-field--disabled</#if>">
            <label class="ops-field-label" for="username">${msg("emailAddress")}</label>
            <input autocomplete="off" required id="username" placeholder="${msg("resetPasswordPlaceholder")}"
                class="login-text-field login-username reset-password-input" name="username" type="text" autofocus>
        </div>
                          
        <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!} no-float">
              <button class="reset-password-submit-button no-shadow mdc-button mdc-button--raised ${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonLargeClass!}" id="kc-submit" type="submit"> ${msg("doSubmit")?no_esc}
              </button>  
              <div style="text-align: center;"> 
                    <a href="${url.loginUrl}" class="reset-password-back-button">${msg("backToLogin")?no_esc}</a>
              </div>          
        </div>
    </form>
    </#if>
</@layout.registrationLayout>
