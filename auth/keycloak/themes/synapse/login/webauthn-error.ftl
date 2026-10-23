<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "title">
        ${kcSanitize(msg("webauthn-error-title"))?no_esc}
    <#elseif section = "header">
        ${kcSanitize(msg("webauthn-error-title"))?no_esc}
    <#elseif section = "form">
        <div class="ops-card-title">${kcSanitize(msg("webauthn-error-title"))?no_esc}</div>

        <script type="text/javascript">
            function refreshPage() {
                document.getElementById('isSetRetry').value = 'retry';
                document.getElementById('executionValue').value = '${execution}';
                document.getElementById('kc-error-credential-form').requestSubmit();
            }
        </script>

        <form id="kc-error-credential-form" class="${properties.kcFormClass!}" action="${url.loginAction}"
              method="post">
            <input type="hidden" id="executionValue" name="authenticationExecution"/>
            <input type="hidden" id="isSetRetry" name="isSetRetry"/>
        </form>

        <div id="kc-form-buttons" class="ops-actions">
            <input onclick="refreshPage()" type="button"
                   class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                   name="try-again" id="kc-try-again" value="${kcSanitize(msg("doTryAgain"))?no_esc}"/>

            <#if isAppInitiatedAction??>
                <form action="${url.loginAction}" class="${properties.kcFormClass!}" id="kc-webauthn-settings-form"
                      method="post">
                    <button type="submit"
                            class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                            id="cancelWebAuthnAIA" name="cancel-aia" value="true">${msg("doCancel")}</button>
                </form>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
