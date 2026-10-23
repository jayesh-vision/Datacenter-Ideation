<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=(realm.registrationAllowed && !registrationDisabled??); section>
    <#if section = "title">
     title
    <#elseif section = "header">
        ${kcSanitize(msg("passkey-login-title"))?no_esc}
    <#elseif section = "form">
        <form id="webauth" action="${url.loginAction}" method="post">
            <input type="hidden" id="clientDataJSON" name="clientDataJSON"/>
            <input type="hidden" id="authenticatorData" name="authenticatorData"/>
            <input type="hidden" id="signature" name="signature"/>
            <input type="hidden" id="credentialId" name="credentialId"/>
            <input type="hidden" id="userHandle" name="userHandle"/>
            <input type="hidden" id="error" name="error"/>
        </form>

        <div class="${properties.kcFormGroupClass!} no-bottom-margin">
            <#if authenticators??>
                <form id="authn_select" class="${properties.kcFormClass!}">
                    <#if (authenticators.authenticators)??>
                    <#list authenticators.authenticators as authenticator>
                        <input type="hidden" name="authn_use_chk" value="${authenticator.credentialId}"/>
                    </#list>
                    </#if>
                </form>

                <#if shouldDisplayAuthenticators?? && shouldDisplayAuthenticators>
                    <#if authenticators.authenticators?size gt 1>
                        <p class="${properties.kcSelectAuthListItemTitle!}">${kcSanitize(msg("passkey-available-authenticators"))?no_esc}</p>
                    </#if>

                    <div class="${properties.kcFormClass!}">
                        <#if (authenticators.authenticators)??>
                        <#list authenticators.authenticators as authenticator>
                            <div id="kc-webauthn-authenticator-item-${authenticator?index}" class="ops-auth-item">
                                <div class="ops-auth-icon">
                                    <i class="${(properties['${authenticator.transports.iconClass}'])!'${properties.kcWebAuthnDefaultIcon!}'} ${properties.kcSelectAuthListItemIconPropertyClass!}"></i>
                                </div>
                                <div class="ops-auth-body">
                                    <div id="kc-webauthn-authenticator-label-${authenticator?index}"
                                         class="ops-auth-heading">
                                        ${kcSanitize(msg('${authenticator.label}'))?no_esc}
                                    </div>

                                    <#if authenticator.transports?? && authenticator.transports.displayNameProperties?has_content>
                                        <div id="kc-webauthn-authenticator-transport-${authenticator?index}"
                                            class="ops-auth-desc">
                                            <#list authenticator.transports.displayNameProperties as nameProperty>
                                                <span>${kcSanitize(msg('${nameProperty!}'))?no_esc}</span>
                                                <#if nameProperty?has_next>
                                                    <span>, </span>
                                                </#if>
                                            </#list>
                        </#if>
                                        </div>
                                    </#if>

                                    <div class="ops-auth-desc">
                                        <span id="kc-webauthn-authenticator-createdlabel-${authenticator?index}">
                                            ${kcSanitize(msg('passkey-createdAt-label'))?no_esc}
                                        </span>
                                        <span id="kc-webauthn-authenticator-created-${authenticator?index}">
                                            ${kcSanitize(authenticator.createdAt)?no_esc}
                                        </span>
                                    </div>
                                </div>
                                <div class="ops-auth-fill"></div>
                            </div>
                        </#list>
                    </div>
                </#if>
            </#if>

            <div id="kc-form">
                <div id="kc-form-wrapper">
                    <#if realm.password>
                        <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post" style="display:none">
                            <#if !usernameHidden??>
                                <div class="${properties.kcFormGroupClass!}">
                                    <label for="username" class="${properties.kcLabelClass!}">${msg("passkey-autofill-select")}</label>
                                    <input tabindex="1" id="username" placeholder="${msg('opsUsernamePlaceholder')}"
                                        aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"
                                        class="${properties.kcInputClass!}" name="username"
                                        value="${(login.username!'')}"
                                        autocomplete="username webauthn"
                                        type="text" autofocus autocomplete="off"
                                        dir="${(locale?? && locale.rtl)?then('rtl', 'ltr')}"/>
                                    <#if messagesPerField.existsError('username')>
                                        <span id="input-error-username" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                            ${kcSanitize(messagesPerField.get('username'))?no_esc}
                                        </span>
                                    </#if>
                                </div>
                            </#if>
                        </form>
                    </#if>
                    <div id="kc-form-passkey-button" class="${properties.kcFormButtonsClass!}" style="display:none">
                        <input id="authenticateWebAuthnButton" type="button" autofocus="autofocus"
                            value="${kcSanitize(msg("passkey-doAuthenticate"))}"
                            class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"/>
                    </div>
                </div>
            </div>
        </div>

        <script type="module">
            import { authenticateByWebAuthn } from "${url.resourcesPath}/js/webauthnAuthenticate.js";
            import { initAuthenticate } from "${url.resourcesPath}/js/passkeysConditionalAuth.js";

            const authButton = document.getElementById('authenticateWebAuthnButton');
            const input = {
                isUserIdentified : ${isUserIdentified},
                challenge : '${challenge}',
                userVerification : '${userVerification}',
                rpId : '${rpId}',
                createTimeout : ${createTimeout?c},
                errmsg : "${msg("webauthn-unsupported-browser-text")?no_esc}"
            };
            authButton.addEventListener("click", () => {
                authenticateByWebAuthn(input);
            }, { once: true });

            const args = {
                isUserIdentified : ${isUserIdentified},
                challenge : '${challenge}',
                userVerification : '${userVerification}',
                rpId : '${rpId}',
                createTimeout : ${createTimeout?c},
                errmsg : "${msg("passkey-unsupported-browser-text")?no_esc}"
            };

            document.addEventListener("DOMContentLoaded", (event) => initAuthenticate(args, (available) => {
                if (available) {
                    document.getElementById("kc-form-login").style.display = "block";
                } else {
                    document.getElementById("kc-form-passkey-button").style.display = 'block';
                }
            }));
        </script>

    <#elseif section = "info">
        <#if realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration">
                <span>${msg("noAccount")} <a tabindex="6" href="${url.registrationUrl}">${msg("doRegister")}</a></span>
            </div>
        </#if>
    </#if>

</@layout.registrationLayout>
