<#import "template.ftl" as layout>
<#import "password-commons.ftl" as passwordCommons>
<@layout.registrationLayout displayRequiredFields=false displayMessage=!messagesPerField.existsError('totp','userLabel'); section>

    <#if section = "header">
        ${msg("loginTotpTitle")}
    <#elseif section = "form">
        <div class="ops-card-title">${msg("loginTotpTitle")}</div>

        <ol id="kc-totp-settings" class="ops-steps">
            <li>
                <p class="ops-step-text">${msg("loginTotpStep1")}</p>
                <ul id="kc-totp-supported-apps" class="ops-app-icons">
                    <li title="Google Authenticator">
                        <img src="${url.resourcesPath}/img/google-icon.svg" alt="Google Authenticator">
                    </li>
                    <li title="Microsoft Authenticator">
                        <img src="${url.resourcesPath}/img/microsoft-icon.svg" alt="Microsoft Authenticator">
                    </li>
                    <li title="Authy">
                        <img src="${url.resourcesPath}/img/authy-icon.svg" alt="Authy">
                    </li>
                </ul>
            </li>

            <#if mode?? && mode = "manual">
                <li>
                    <p class="ops-step-text">${msg("loginTotpManualStep2")}</p>
                    <div class="ops-manual-panel">
                        <div class="ops-manual-row is-stacked">
                            <span class="ops-manual-key">${msg("loginTotpSecretKey")}</span>
                            <span class="ops-manual-val" id="kc-totp-secret-key">${totp.totpSecretEncoded}</span>
                        </div>
                    </div>
                    <a href="${totp.qrUrl}" id="mode-barcode" class="ops-link">${msg("loginTotpScanBarcode")}</a>
                </li>
                <li>
                    <p class="ops-step-text">${msg("loginTotpManualStep3")}</p>
                    <div class="ops-manual-panel">
                        <div class="ops-manual-row">
                            <span class="ops-manual-key">${msg("loginTotpType")}</span>
                            <span class="ops-manual-val" id="kc-totp-type">${msg("loginTotp." + totp.policy.type)}</span>
                        </div>
                        <div class="ops-manual-row">
                            <span class="ops-manual-key">${msg("loginTotpAlgorithm")}</span>
                            <span class="ops-manual-val" id="kc-totp-algorithm">${totp.policy.getAlgorithmKey()}</span>
                        </div>
                        <div class="ops-manual-row">
                            <span class="ops-manual-key">${msg("loginTotpDigits")}</span>
                            <span class="ops-manual-val" id="kc-totp-digits">${totp.policy.digits}</span>
                        </div>
                        <#if totp.policy.type = "totp">
                            <div class="ops-manual-row">
                                <span class="ops-manual-key">${msg("loginTotpInterval")}</span>
                                <span class="ops-manual-val" id="kc-totp-period">${totp.policy.period}</span>
                            </div>
                        <#elseif totp.policy.type = "hotp">
                            <div class="ops-manual-row">
                                <span class="ops-manual-key">${msg("loginTotpCounter")}</span>
                                <span class="ops-manual-val" id="kc-totp-counter">${totp.policy.initialCounter}</span>
                            </div>
                        </#if>
                    </div>
                </li>
            <#else>
                <li>
                    <p class="ops-step-text">${msg("loginTotpStep2")}</p>
                    <div class="ops-qr">
                        <img id="kc-totp-secret-qr-code" src="data:image/png;base64, ${totp.totpSecretQrCode}"
                             alt="${msg("loginTotpStep2")}" width="150" height="150">
                    </div>
                    <a href="${totp.manualUrl}" id="mode-manual" class="ops-link">${msg("loginTotpUnableToScan")}</a>
                </li>
            </#if>

            <li>
                <p class="ops-step-text">${msg("loginTotpStep3")}</p>
            </li>
        </ol>

        <form action="${url.loginAction}" class="form login-form ${properties.kcFormClass!}" id="kc-totp-settings-form" method="post">
            <div class="ops-field">
                <label for="totp" class="ops-field-label">${msg("authenticatorCode")} *</label>
                <input type="text" id="totp" name="totp" autocomplete="off" class="login-text-field"
                       maxlength="6" inputmode="numeric" pattern="${msg('otpRegex')}"
                       placeholder="${msg('otpPlaceholder')!}"
                       oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,6);"
                       aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                       dir="${(locale?? && locale.rtl)?then('rtl', 'ltr')}" autofocus />

                <#if messagesPerField.existsError('totp')>
                    <span id="input-error-otp-code" class="ops-field-error" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                    </span>
                </#if>
            </div>

            <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
            <#if mode??><input type="hidden" id="mode" name="mode" value="${mode}"/></#if>

            <@passwordCommons.logoutOtherSessions/>

            <div id="kc-form-buttons" class="ops-actions">
                <#if isAppInitiatedAction??>
                    <input type="submit" id="saveTOTPBtn" value="${msg("doSubmit")}"
                           class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonLargeClass!}" />
                    <button type="submit" id="cancelTOTPBtn" name="cancel-aia" value="true"
                            class="${properties.kcButtonClass!} ${properties.kcButtonDefaultClass!} ${properties.kcButtonLargeClass!}">${msg("doCancel")}</button>
                <#else>
                    <input type="submit" id="saveTOTPBtn" value="${msg("doSubmit")}"
                           class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" />
                </#if>
            </div>

            <div class="ops-back-row">
                <a href="${url.loginRestartFlowUrl}" class="ops-back-link">${kcSanitize(msg("backToLogin"))?no_esc}</a>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
