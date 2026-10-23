<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayWide=false displayRequiredFields=false>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${(locale.currentLanguageTag)!'en'}" class="${properties.kcHtmlClass!}">

<head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>

    <title>${msg("opsBrandName")} &ndash; <#nested "title"></title>
    <link rel="shortcut icon" href="${url.resourcesPath}/img/synapse-mark.svg" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap" />

    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link rel="stylesheet" href="${url.resourcesPath}/${style}" />
        </#list>
    </#if>
    <#-- Synapse loads last so it wins over material-components-web: synapse.css = the shared form styling (re-coloured
         from the Opstral theme), synapse-shell.css = the Synapse page layout and brand panel -->
    <link rel="stylesheet" href="${url.resourcesPath}/css/synapse.css?v=1.0" />
    <link rel="stylesheet" href="${url.resourcesPath}/css/synapse-shell.css?v=1.1" />

    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
</head>

<body class="${properties.kcBodyClass!} op-body ${bodyClass}">

<main class="op-stage syn-stage">

    <div class="syn-scene" aria-hidden="true" style="background-image:url(${url.resourcesPath}/img/synapse-aisle.svg)"></div>

    <section class="op-hero syn-hero" aria-label="${msg("opsBrandName")}">

        <div class="op-brand syn-brand">
            <img class="syn-logo" src="${url.resourcesPath}/img/synapse-logo-white.svg" alt="${msg("opsBrandName")}" />
        </div>

        <div class="op-hero__mid">
            <div class="op-eyebrow">${msg("opsEyebrow")}</div>
            <h1 class="op-display">${msg("opsBrandName")}<span class="op-display__dot">.</span></h1>
            <p class="op-lede">${msg("opsBrandDesc")}</p>
        </div>
    </section>

    <section class="op-auth">
        <div class="op-auth__inner">
            <div class="syn-mobile-brand"><img src="${url.resourcesPath}/img/synapse-logo-white.svg" alt="${msg("opsBrandName")}" /></div>

            <#assign _preContainer><#nested "preContainer" ignore_missing></#assign>
            <#if _preContainer?has_content><div id="login-username-step">${_preContainer}</#if>

            <div class="op-card">
                <div class="op-card__body" id="kc-content-wrapper">

                    <#if displayMessage && message?has_content && message.summary!='Invalid username or password.' && message.summary!='You took too long to login.'>
                        <div class="${properties.kcFeedbackAreaClass!}" id="error-message-divId">
                            <div class="alert alert-${message.type} op-alert op-alert--${message.type}">
                                <#if message.type='success'><span class="${properties.kcFeedbackSuccessIcon!}"></span></#if>
                                <#if message.type='warning'><span class="${properties.kcFeedbackWarningIcon!}"></span></#if>
                                <#if message.type='error'><span class="${properties.kcFeedbackErrorIcon!}"></span></#if>
                                <#if message.type='info'><span class="${properties.kcFeedbackInfoIcon!}"></span></#if>
                                <span class="kc-feedback-text">${kcSanitize(message.summary)?no_esc}</span>
                            </div>
                        </div>
                    </#if>

                    <div id="kc-form" class="${properties.kcFormAreaClass!} kc-form-container">
                        <div id="kc-form-wrapper" class="${properties.kcFormAreaWrapperClass!} kc-form-container-child">
                            <#nested "form">
                        </div>
                    </div>

                    <#if displayInfo>
                        <div id="kc-info-wrapper">
                            <#nested "info">
                        </div>
                    </#if>

                </div>
            </div>

            <#if _preContainer?has_content></div></#if>


        </div>
    </section>

</main>

</body>

        <script>

            // On reload, return to the stored login URL if the host app left one.
            // Everything here is guarded: an absent key used to yield
            // location.replace(null), which resolves against <base href="/">
            // and sent every refresh to <origin>/null.
            (function returnToStoredLoginUrl() {
                var isReload = false;
                try {
                    var nav = window.performance
                        && window.performance.getEntriesByType
                        && window.performance.getEntriesByType('navigation')[0];
                    if (nav) {
                        isReload = (nav.type === 'reload');
                    } else if (window.performance && window.performance.navigation) {
                        isReload = (window.performance.navigation.type === 1);
                    }
                } catch (e) {
                    isReload = false;
                }
                if (!isReload) {
                    return;
                }

                var regDiv = document.getElementById("registrationDiv");
                if (regDiv) {
                    regDiv.style.display = "none";
                }

                if (location.pathname.indexOf('openid-connect/auth') !== -1) {
                    return;
                }

                var stored = null;
                try {
                    stored = localStorage.getItem("loginPageUrl");
                } catch (e) {
                    return;                      // storage blocked / private mode
                }
                if (stored === null || stored === undefined) {
                    return;
                }
                stored = String(stored).trim();
                if (!stored || stored === "null" || stored === "undefined") {
                    return;
                }

                var target;
                try {
                    target = new URL(stored, location.href);
                } catch (e) {
                    return;                      // not a usable URL
                }
                if (target.protocol !== 'http:' && target.protocol !== 'https:') {
                    return;                      // no javascript:/data: targets
                }
                if (target.origin !== location.origin) {
                    return;                      // stays on this environment's host
                }
                if (target.href === location.href) {
                    return;                      // never reload-loop onto ourselves
                }
                location.replace(target.href);
            })();


            setDefaultAction();

            function setDefaultAction() {
                removeBrFromString();
                setTimeout(function () {
                    var regisPageRef = document.getElementById('regisPage');
                    if (regisPageRef) {
                        var divRef = document.getElementById("backdropDiv");
                        divRef.style.display = "block";
                    }
                }, 200);

            }

          

            function removeBrFromString() {
                var spanRef = document.getElementById("displayMsgSpan");
                if (spanRef) {
                    spanRef.innerText = spanRef.innerText.replace("Username already exists.", "");
                    spanRef.innerText = spanRef.innerText.replace("<br>", "");
                }
            }




            function togglePassword(id1, id2) {
                var x = document.getElementById("password1");
                var v = document.getElementById("regVi");
                if (x.type === "password") {
                    x.type = "text";
                    v.src = "${url.resourcesPath}/img/eye.png";
                } else {
                    x.type = "password";
                    v.src = "${url.resourcesPath}/img/eye-off.png";
                }
            }

             function togglePasswordNewpass(){
                var x = document.getElementById("password-new");
                var v = document.getElementById("vi-new");
                if (x.type === "password") {
                    x.type = "text";
                    v.src = "${url.resourcesPath}/img/eye.png";
                } else {
                    x.type = "password";
                    v.src = "${url.resourcesPath}/img/eye-off.png";
                }
             }


             function togglePasswordNewConfirmPas(){
                    var x = document.getElementById("password-confirm");
                    var v = document.getElementById("vi-confirm");
                    if (x.type === "password") {
                        x.type = "text";
                        v.src = "${url.resourcesPath}/img/eye.png";
                    } else {
                        x.type = "password";
                        v.src = "${url.resourcesPath}/img/eye-off.png";
                    }
             }

            function togglePasswordSignIN(id1, id2) {
                var x = document.getElementById("password");
                var v = document.getElementById("vi");
                if (x.type === "password") {
                    x.type = "text";
                    v.src = "${url.resourcesPath}/img/eye.png";
                } else {
                    x.type = "password";
                    v.src = "${url.resourcesPath}/img/eye-off.png";
                }
            }



            function togglePasswordConfirm(id1, id2) {
                var x = document.getElementById("confirmpassword1");
                var v = document.getElementById("regCVi");
                if (x.type === "password") {
                    x.type = "text";
                    v.src = "${url.resourcesPath}/img/eye.png";
                } else {
                    x.type = "password";
                    v.src = "${url.resourcesPath}/img/eye-off.png";
                }
            }
            
            function toggleRegistration(loginUrl) {
                        window.location.href = loginUrl; 
            }

            function onCloseMsgDiv() {
                var divRef = document.getElementById("displayMsgDiv");
                if (divRef) {
                    divRef.style.display = "none";
                }
            }

          

        </script>

</html>
</#macro>
