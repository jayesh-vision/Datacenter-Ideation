<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=social.displayInfo displayWide=(realm.password && social.providers??); section>
    <#if section = "header">
        ${msg("doLogIn")}
    <#elseif section = "preContainer">
    <style>
        #login-username-step {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            flex: 0 0 420px;
            order: 2;
            max-width: 420px;
            margin: 0 clamp(24px, 4vw, 64px) 0 0;
        }

        #login-username-step .kc-container {
            width: 100%;
            max-width: 100%;
            flex: none;
            margin: 0;
        }

        #login-username-step-welcome {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 22px;
            font-weight: 400;
            color: #ffffff;
            text-align: center;
            margin: 0 0 12px;
            padding: 0;
            line-height: 1.3;
        }

        @media (max-width: 750px) {
            #login-username-step {
                width: 100%;
                max-width: 420px;
                flex: 0 0 auto;
                margin-right: 0;
            }
        }
    </style>
    <h2 id="login-username-step-welcome">${msg("opsWelcomeBack")}</h2>
    <#elseif section = "form">
    <style>
        /* Layout only. Field, label and button styling comes from the shared
           sign-in card system in style.css so every screen matches. */
        #kc-form-login.kc-username-only-form .kc-username-only-field {
            display: block;
            width: 100%;
            margin-bottom: 16px;
        }

        #kc-form-login.kc-username-only-form .kc-username-only-input-wrap {
            display: block;
            width: 100%;
        }

        #kc-form-login.kc-username-only-form #kc-form-buttons {
            width: 100%;
            margin-top: 0;
            float: none;
        }
    </style>
    <div id="kc-form" <#if realm.password && social.providers??>class="${properties.kcContentWrapperClass!}"</#if>>
      <div id="kc-form-wrapper" <#if realm.password && social.providers??>class="${properties.kcFormSocialAccountContentClass!} ${properties.kcFormSocialAccountClass!}"</#if>>
        <#if realm.password>
            <form id="kc-form-login" class="kc-username-only-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                <div class="kc-username-only-field ${properties.kcFormGroupClass!}">
                    <label for="username" class="kc-username-only-label ${properties.kcLabelClass!}"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></label>

                    <div class="kc-username-only-input-wrap">
                    <#if usernameEditDisabled??>
                        <input tabindex="1" id="username" class="${properties.kcInputClass!}" name="username" placeholder="${msg('opsUsernamePlaceholder')}" value="${(login.username!'')}" type="text" disabled />
                    <#else>
                        <input tabindex="1" id="username" class="${properties.kcInputClass!}" name="username" placeholder="${msg('opsUsernamePlaceholder')}" value="${(login.username!'')}"  type="text" autofocus autocomplete="off" />
                    </#if>
                    </div>
                </div>

                <div class="${properties.kcFormGroupClass!} ${properties.kcFormSettingClass!}">
                    <div id="kc-form-options">
                        <#if realm.rememberMe && !usernameEditDisabled??>
                            <div class="checkbox">
                                <label>
                                    <#if login.rememberMe??>
                                        <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" checked> ${msg("rememberMe")}
                                    <#else>
                                        <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox"> ${msg("rememberMe")}
                                    </#if>
                                </label>
                            </div>
                        </#if>
                        </div>
                  </div>

                  <div id="kc-form-buttons" class="${properties.kcFormGroupClass!}">
                    <input tabindex="4" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
                  </div>
            </form>
        </#if>
        </div>
        <#if realm.password && social.providers??>
            <div id="kc-social-providers" class="${properties.kcFormSocialAccountContentClass!} ${properties.kcFormSocialAccountClass!}">
                <ul class="${properties.kcFormSocialAccountListClass!} <#if social.providers?size gt 4>${properties.kcFormSocialAccountDoubleListClass!}</#if>">
                    <#list social.providers as p>
                        <li class="${properties.kcFormSocialAccountListLinkClass!}"><a href="${p.loginUrl}" id="zocial-${p.alias}" class="zocial ${p.providerId}"> <span>${p.displayName}</span></a></li>
                    </#list>
                </ul>
            </div>
        </#if>
      </div>
    <#elseif section = "info" >
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration">
                <span>${msg("noAccount")} <a tabindex="6" href="${url.registrationUrl}">${msg("doRegister")}</a></span>
            </div>
        </#if>
    </#if>

</@layout.registrationLayout>
