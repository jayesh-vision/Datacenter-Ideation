<style>
</style>
<script>
  function togglePassword(inputId,srcId) {
        var x = document.getElementById(inputId);
        var v = document.getElementById(srcId);
        if (x.type === "password") {
            x.type = "text";
            v.src = "${url.resourcesPath}/img/eye.png";
        } else {
            x.type = "password";
            v.src = "${url.resourcesPath}/img/eye-off.png";
        }
    }
</script>
<#import "template.ftl" as layout>
    <@layout.registrationLayout displayInfo=true; section>
        <#if section="title">
            ${msg("updatePasswordTitle")?no_esc}
            <#elseif section="header">
                ${msg("updatePasswordTitle")?no_esc}
                <#elseif section="form">
                    <form id="kc-passwd-update-form" class="form login-form" action="${url.loginAction}" method="post">
                         <div class="update-password-container ${properties.kcFormGroupClass!}">
                                <div class="ops-field password-container">
                                    <label class="ops-field-label" for="password-new">${msg("passwordNew")}</label>
                                    <div class="login-password-div login-reset-password-div">
                                        <input class="login-text-field login-password login-update-new-password" placeholder="${msg("opsNewPasswordPlaceholder")}" autocomplete="off" required id="password-new"
                                            autofocus name="password-new" type="password">

                                        <label class="visibility" onclick="togglePasswordNewpass('password-new', 'vi-new')"><img class="eyeimg"
                                          alt="view" id="vi-new" src="${url.resourcesPath}/img/eye-off.png" width="16" height="16"></label>
                                    </div>
                                    <div id="password-policy-text">Use 8+ character with uppercase, lowercase, numbers and symbols.</div>
                                </div>

                                <div class="ops-field password-container">
                                    <label class="ops-field-label" for="password-confirm">${msg("passwordConfirm")}</label>
                                    <div class="login-password-div login-reset-password-div">
                                        <input class="login-text-field login-password login-update-confirm-password" type="password" autocomplete="off" required id="password-confirm"
                                            name="password-confirm" placeholder="${msg("opsConfirmPasswordPlaceholder")}" />

                                        <label class="visibility" onclick="togglePasswordNewConfirmPas('password-confirm', 'vi-confirm')"><img class="eyeimg"
                                         alt="view" id="vi-confirm" src="${url.resourcesPath}/img/eye-off.png" width="16" height="16"></label>
                                    </div>
                                  </div>
                         </div>

                        <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!} signInBtn col-xs-6 col-sm-4">
                            <button class="login-update-password-submit mdc-button ${properties.kcButtonClass!}  ${properties.kcButtonLargeClass!}"
                                name="SUBMIT" type="submit">
                                ${msg("doSubmit")}
                            </button>
                        </div>
                    </form>
        </#if>
    </@layout.registrationLayout>