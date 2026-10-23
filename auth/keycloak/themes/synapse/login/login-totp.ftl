<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('totp'); section>
    <#if section = "title">
        ${msg("verificationcode")}
    <#elseif section = "header">
        ${msg("verificationcode")}
    <#elseif section = "form">
        <div class="ops-card-title">${msg("verificationcode")}</div>

        <form id="kc-otp-login-form" class="form totp ${properties.kcFormClass!}" action="${url.loginAction}"
              method="post" onkeydown="enterKeySubmit(event);">

            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcInputWrapperClass!}">
                    <div class="${properties.kcLabelClass!} <#if usernameEditDisabled??>mdc-text-field--disabled</#if>">

                        <label for="otp" class="enterCodeHere ${properties.kcLabelClass!}">${msg("entercodehere")}</label>

                        <div class="divOuter mrg-btm-0">
                            <div class="divInner">
                                <input maxlength="6" id="otp" name="otp" autocomplete="off"
                                       placeholder="${msg('opsTotpPlaceholder')}"
                                       class="mdc-text-field__input partitioned ${properties.kcInputClass!}"
                                       type="number" inputmode="numeric"
                                       onKeyPress="if(this.value.length==6) return false;"
                                       aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                                       dir="${(locale?? && locale.rtl)?then('rtl', 'ltr')}" autofocus />
                            </div>
                        </div>

                        <#if messagesPerField.existsError('totp')>
                            <span id="input-error-otp-code" class="ops-field-error" aria-live="polite">
                                ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                            </span>
                        </#if>

                    </div>
                </div>
            </div>

            <div class="${properties.kcFormGroupClass!} totp-button-container">
                <div id="kc-form-options" class="${properties.kcFormOptionsClass!}">
                    <div class="${properties.kcFormOptionsWrapperClass!}">
                    </div>
                </div>

                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <div class="${properties.kcFormButtonsWrapperClass!}">
                        <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                               name="login" id="kc-login" type="submit" value="${msg("doSubmit")}"/>
                        <input class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} kc-form-otp-cancel-button"
                               name="cancel" id="kc-cancel" type="submit" value="${msg("doCancel")}"/>
                    </div>
                </div>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>

<script>
    function enterKeySubmit(event) {
        if (event.keyCode === 13) {
            document.getElementById("kc-otp-login-form").submit();
        }
    }

    // the field keeps a filled-state border once it holds a value
    document.querySelectorAll('#kc-otp-login-form input').forEach(function (input) {
        input.addEventListener('blur', function () {
            this.classList.toggle('green', this.value.length > 0);
        });
    });
</script>
