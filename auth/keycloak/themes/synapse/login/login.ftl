<script type="text/javascript" src="${url.resourcesPath}/js/aes.js"></script>
<script type="text/javascript" src="${url.resourcesPath}/js/pbkdf2.js"></script>

<script>
    async function validateLoginForm(event) {
        event.preventDefault();                       // stop the immediate submit until encryption finishes
        var form = document.getElementById("kc-form-login");
        var password = document.getElementById("password").value;

        const enc   = new TextEncoder();
        const nonce = crypto.getRandomValues(new Uint8Array(12)); // GCM standard = 12 bytes
        const salt  = crypto.getRandomValues(new Uint8Array(16));

        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode("productLogin/js/dist/loginLib.min.js"),
            "PBKDF2", false, ["deriveKey"]
        );
        const key = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100, hash: "SHA-1" },
            keyMaterial,
            { name: "AES-GCM", length: 128 },   // 128-bit to match old keySize:4
            false, ["encrypt"]
        );
        const cipherBuf = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: nonce, tagLength: 128 },
            key, enc.encode(password)
        );

        const b64 = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
        document.getElementById("password").value =
            b64(nonce) + ":" + b64(salt) + ":" + b64(cipherBuf);

        form.submit();   // native submit() does NOT re-fire onsubmit -> no loop
    }
    function togglePassword() {
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

</script>

<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=social.displayInfo; section>

    <#if section="title">
        ${msg("loginTitle",(realm.displayName!''))?no_esc}

    <#elseif section="header">
        <div class="title">${msg("loginTitleHtml",(realm.displayNameHtml!''))?no_esc}</div>

    <#elseif section="form">

        <div id="registrationDiv" style="display:none">
            <#include "register.ftl" />
        </div>

        <#if realm.password>

        <header class="op-card__head">
            <h1 class="op-card__title">${msg("doLogIn")}</h1>
            <p class="op-card__sub">${msg("opsWelcomeBack")}</p>
        </header>

        <form autocomplete="off" id="kc-form-login" class="form op-form ${properties.kcFormClass!} login-form"
              onsubmit="validateLoginForm(event); return false;" action="${url.loginAction}" method="post">

      <#if realm.password && social?? && social.providers?has_content>
        <div class="ops-social-section">
            <div id="kc-social-providers" class="ops-social-providers ${properties.kcFormSocialAccountSectionClass!}">
                <div class="ops-social-list ${properties.kcFormSocialAccountListClass!} <#if social.providers?size gt 3>${properties.kcFormSocialAccountListGridClass!}</#if>">
                    <#list social.providers as p>
                         <div class="custom-social-button ${properties.kcFormSocialAccountListItemClass!}">
                  <a id="social-${p.alias}" class="azure-login-button ${properties.kcFormSocialAccountListButtonClass!} <#if social.providers?size gt 3>${properties.kcFormSocialAccountGridItem!}</#if>" aria-label="${p.displayName!}"
                          type="button" href="${p.loginUrl}">
                      <div style="display:flex; gap:10px;">
                       <span class="social-icon">
                        <#if p.iconClasses?has_content>
                            <span class="${p.iconClasses!}">${p.displayName!}</span>
                        <#else>
                        <#switch p.alias>
                            <#case "google">
                                <svg aria-hidden="true" viewBox="0 0 488 512">
                                    <title id="title">Google</title>
                                    <path fill="currentColor" fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"/>
                                </svg>
                                <#break>
                            <#case "github">
                                <svg aria-hidden="true" viewBox="0 0 496 512">
                                    <title id="title">GitHub</title>
                                    <path fill="currentColor" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>
                                </svg>
                                <#break>
                            <#case "facebook">
                                <svg aria-hidden="true" viewBox="0 0 448 512">
                                    <title id="title">Facebook</title>
                                    <path fill="currentColor" d="M448 56.7v398.5c0 13.7-11.1 24.7-24.7 24.7H309.1V306.5h58.2l8.7-67.6h-67v-43.2c0-19.6 5.4-32.9 33.5-32.9h35.8v-60.5c-6.2-.8-27.4-2.7-52.2-2.7-51.6 0-87 31.5-87 89.4v49.9h-58.4v67.6h58.4V480H24.7C11.1 480 0 468.9 0 455.3V56.7C0 43.1 11.1 32 24.7 32h398.5c13.7 0 24.8 11.1 24.8 24.7z"/>
                                </svg>
                                <#break>
                            <#case "gitlab">
                                <svg aria-hidden="true" viewBox="0 0 512 512">
                                    <title id="title">GitLab</title>
                                    <path fill="currentColor" d="M29.782 199.732L256 493.714 8.074 309.699c-6.856-5.142-9.712-13.996-7.141-21.993l28.849-87.974zm75.405-174.806c-3.142-8.854-15.709-8.854-18.851 0L29.782 199.732h131.961L105.187 24.926zm56.556 174.806L256 493.714l94.257-293.982H161.743zm349.324 87.974l-28.849-87.974L256 493.714l247.926-184.015c6.855-5.142 9.711-13.996 7.141-21.993zm-85.404-262.78c-3.142-8.854-15.709-8.854-18.851 0l-56.555 174.806h131.961L425.663 24.926z"/>
                                </svg>
                                <#break>
                            <#case "linkedin">
                            <#case "linkedin-openid-connect">
                                <svg aria-hidden="true" viewBox="0 0 448 512">
                                    <title id="title">LinkedIn</title>
                                    <path fill="currentColor" d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z"/>
                                </svg>
                                <#break>
                            <#case "openshift-v4">
                                <svg viewBox="116 0 100 100" aria-hidden="true">
                                    <title id="title">OpenShift</title>
                                    <path fill="currentColor" d="M145.7,45.3l-16.1,5.8c0.2,2.6,0.6,5.1,1.3,7.6l15.3-5.6C145.7,50.6,145.5,47.9,145.7,45.3M216.7,27.5c-1.1-2.3-2.4-4.5-3.9-6.6l-16.1,5.8c1.9,1.9,3.4,4.1,4.7,6.4L216.7,27.5zM181.4,23c3.3,1.6,6.2,3.7,8.7,6.2l16.1-5.8c-4.4-6.2-10.5-11.5-17.9-14.9c-22.9-10.7-50.3-0.7-61,22.2c-3.5,7.4-4.8,15.3-4.1,23l16.1-5.8c0.3-3.5,1.1-7,2.7-10.3C148.7,22.5,166.4,16,181.4,23M131.9,58.4l-15.3,5.6c1.4,5.6,3.8,10.8,7.2,15.5l16-5.8C135.8,69.4,133,64.1,131.9,58.4M198.5,52.3c-0.3,3.5-1.1,7-2.7,10.3C188.8,77.5,171,84,156.1,77c-3.3-1.6-6.3-3.7-8.7-6.2l-16,5.8c4.4,6.2,10.5,11.5,17.9,14.9c22.9,10.7,50.3,0.7,61-22.2c3.5-7.4,4.7-15.3,4.1-22.9L198.5,52.3zM202.4,32.7l-15.3,5.6c2.8,5.1,4.2,10.9,3.7,16.8l16-5.8C206.5,43.5,204.9,37.9,202.4,32.7"></path>
                                </svg>
                                <#break>
                            <#case "stackoverflow">
                                <svg viewBox="0 0 384 512" aria-hidden="true">
                                    <title id="title">Stack Overflow</title>
                                    <path fill="currentColor" d="M290.7 311L95 269.7 86.8 309l195.7 41zm51-87L188.2 95.7l-25.5 30.8 153.5 128.3zm-31.2 39.7L129.2 179l-16.7 36.5L293.7 300zM262 32l-32 24 119.3 160.3 32-24zm20.5 328h-200v39.7h200zm39.7 80H42.7V320h-40v160h359.5V320h-40z"></path>
                                </svg>
                                <#break>
                            <#case "twitter">
                                <svg viewBox="0 0 512 512" aria-hidden="true">
                                    <title id="title">Twitter</title>
                                    <path fill="currentColor" d="M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.583 298.558-298.558 298.558-59.452 0-114.68-17.219-161.137-47.106 8.447.974 16.568 1.299 25.34 1.299 49.055 0 94.213-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.498.974 12.995 1.624 19.818 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.431 13.319-28.264-18.843-46.781-51.005-46.781-87.391 0-19.492 5.197-37.36 14.294-52.954 51.655 63.675 129.3 105.258 216.365 109.807-1.624-7.797-2.599-15.918-2.599-24.04 0-57.828 46.782-104.934 104.934-104.934 30.213 0 57.502 12.67 76.67 33.137 23.715-4.548 46.456-13.32 66.599-25.34-7.798 24.366-24.366 44.833-46.132 57.827 21.117-2.273 41.584-8.122 60.426-16.243-14.292 20.791-32.161 39.308-52.628 54.253z"></path>
                                </svg>
                                <#break>
                            <#case "microsoft">
                                <svg viewBox="0 0 448 512" aria-hidden="true">
                                    <title id="title">Microsoft</title>
                                    <path fill="currentColor" d="M0 32h214.6v214.6H0V32zm233.4 0H448v214.6H233.4V32zM0 265.4h214.6V480H0V265.4zm233.4 0H448V480H233.4V265.4z"></path>
                                </svg>
                                <#break>
                            <#case "bitbucket">
                                <svg viewBox="0 0 512 512" aria-hidden="true">
                                    <title id="title">Bitbucket</title>
                                    <path fill="currentColor" d="M22.2 32A16 16 0 0 0 6 47.8a26.35 26.35 0 0 0 .2 2.8l67.9 412.1a21.77 21.77 0 0 0 21.3 18.2h325.7a16 16 0 0 0 16-13.4L505 50.7a16 16 0 0 0-13.2-18.3 24.58 24.58 0 0 0-2.8-.2L22.2 32zm285.9 297.8h-104l-28.1-147h157.3l-25.2 147z"></path>
                                </svg>
                                <#break>
                            <#case "instagram">
                                <svg viewBox="0 0 448 512" aria-hidden="true">
                                    <title id="title">Instagram</title>
                                    <path fill="currentColor" d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"></path>
                                </svg>
                                <#break>
                            <#case "paypal">
                                <svg viewBox="0 0 384 512" aria-hidden="true">
                                    <title id="title">PayPal</title>
                                    <path fill="currentColor" d="M111.4 295.9c-3.5 19.2-17.4 108.7-21.5 134-.3 1.8-1 2.5-3 2.5H12.3c-7.6 0-13.1-6.6-12.1-13.9L58.8 46.6c1.5-9.6 10.1-16.9 20-16.9 152.3 0 165.1-3.7 204 11.4 60.1 23.3 65.6 79.5 44 140.3-21.5 62.6-72.5 89.5-140.1 90.3-43.4.7-69.5-7-75.3 24.2zM357.1 152c-1.8-1.3-2.5-1.8-3 1.3-2 11.4-5.1 22.5-8.8 33.6-39.9 113.8-150.5 103.9-204.5 103.9-6.1 0-10.1 3.3-10.9 9.4-22.6 140.4-27.1 169.7-27.1 169.7-1 7.1 3.5 12.9 10.6 12.9h63.5c8.6 0 15.7-6.3 17.4-14.9.7-5.4-1.1 6.1 14.4-91.3 4.6-22 14.3-19.7 29.3-19.7 71 0 126.4-28.8 142.9-112.3 6.5-34.8 4.6-71.4-23.8-92.6z"></path>
                                </svg>
                                <#break>
                             <#case "Azure">
                               <svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none">
                                    <path fill="currentColor" d="M9.5 11.4999L11.5 13.4999L16 8.99987M20.5 11.9999C20.5 16.9083 15.146 20.4783 13.198 21.6147C12.9766 21.7439 12.8659 21.8085 12.7097 21.842C12.5884 21.868 12.4116 21.868 12.2903 21.842C12.1341 21.8085 12.0234 21.7439 11.802 21.6147C9.85396 20.4783 4.5 16.9083 4.5 11.9999V7.21747C4.5 6.41796 4.5 6.0182 4.63076 5.67457C4.74627 5.37101 4.93398 5.10015 5.17766 4.8854C5.4535 4.64231 5.8278 4.50195 6.5764 4.22122L11.9382 2.21054C12.1461 2.13258 12.25 2.0936 12.357 2.07815C12.4518 2.06444 12.5482 2.06444 12.643 2.07815C12.75 2.0936 12.8539 2.13258 13.0618 2.21054L18.4236 4.22122C19.1722 4.50195 19.5465 4.64231 19.8223 4.8854C20.066 5.10015 20.2537 5.37101 20.3692 5.67457C20.5 6.0182 20.5 6.41796 20.5 7.21747V11.9999Z"  stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                <#break>   
                            <#default>
                                <span aria-hidden="true">
                                    <svg viewBox="0 0 512 512" aria-hidden="true">
                                        <path fill="currentColor" d="M239.1 6.3l-208 78c-18.7 7-31.1 25-31.1 45v225.1c0 18.2 10.3 34.8 26.5 42.9l208 104c13.5 6.8 29.4 6.8 42.9 0l208-104c16.3-8.1 26.5-24.8 26.5-42.9V129.3c0-20-12.4-37.9-31.1-44.9l-208-78C262 2.2 250 2.2 239.1 6.3zM256 68.4l192 72v1.1l-192 78-192-78v-1.1l192-72zm32 356V275.5l160-65v133.9l-160 80z"/>
                                    </svg>
                                </span>
                        </#switch>
                        </#if>
                        </span>
                        <span class="social-name">${msg(p.displayName!)!}</span>
                        </div>
                  </a>
              </div>
                    </#list>
                </div>
            </div>

            <div class="ops-social-divider-wrap">
              <div class="social-label ops-social-divider"
              style="margin-bottom:1em"
               role="separator" aria-label="${msg('identity-provider-login-label')}">${msg("identity-provider-login-label")}</div>
            </div>
        </div>
        </#if>


            <#if message?? && message?has_content & (message.summary=='Invalid username or password.' || message.summary=='You took too long to login.')>
                <div class="alert alert-${message.type} op-alert op-alert--${message.type}">
                    <#if message.type='error'><img src="${url.resourcesPath}/img/warning.png" alt="" /></#if>
                    <span class="kc-feedback-text">${message.summary}</span>
                </div>
            </#if>

            <div class="op-field ops-field username-input-div <#if usernameEditDisabled??>mdc-text-field--disabled</#if>">
                <label class="op-label ops-field-label" for="username">${msg("emailAddress")}</label>
                <div class="op-input-wrap">
                    <input id="username" name="username" type="text" required
                           class="op-input login-text-field login-username"
                           placeholder="${msg('opsEmailPlaceholder')}"
                           value="${(login.username!'')}"
                           autocomplete="off" <#if usernameEditDisabled??>disabled</#if> />
                </div>
            </div>

            <div class="op-field ops-field password-container ${properties.kcFormGroupClass!}">
                <label class="op-label ops-field-label" for="password">${msg("password")}</label>
                <div class="op-input-wrap login-password-div">
                    <input id="password" name="password" type="password" required
                           class="op-input login-text-field login-password"
                           placeholder="${msg('opsPasswordPlaceholder')}"
                           autocomplete="off" />
                    <label class="op-eye visibility" id="v" onclick="togglePasswordSignIN('password', 'vi')">
                        <img class="eyeimg" alt="view" id="vi"
                             src="${url.resourcesPath}/img/eye-off.png" width="16" height="16" />
                    </label>
                </div>
            </div>

            <div class="op-options" id="kc-form-options">
                <#if realm.rememberMe && !usernameEditDisabled??>
                    <label class="op-check remberMePosition" for="rememberMe">
                        <input type="checkbox" name="rememberMe" id="rememberMe" <#if login.rememberMe??>checked</#if> />
                        <span class="remberMeLabel">${msg("rememberMe")}</span>
                    </label>
                <#else>
                    <span></span>
                </#if>
                <#if realm.resetPasswordAllowed>
                    <a class="op-link forgot-password" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                </#if>
            </div>

            <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                <button class="op-submit signin-button ${properties.kcButtonClass!}"
                        name="SUBMIT" id="kc-login" type="submit">${msg("doLogIn")}</button>
            </div>
        </form>

        <#if realm.registrationAllowed && !usernameEditDisabled??>
            <div class="op-card__foot">
                <span class="no-account-text">${msg("noAccount")}</span>
                <a class="op-link register-button" href="${url.registrationUrl}">${msg("doRegister")}</a>
            </div>
        </#if>

        </#if>

    <#elseif section="info">

    </#if>

</@layout.registrationLayout>
