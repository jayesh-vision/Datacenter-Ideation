<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false; section>
    <#if section = "header" || section = "show-username">
        <#if section = "header">
            ${msg("loginChooseAuthenticator")}
        </#if>
    <#elseif section = "form">
        <div class="ops-card-title">${msg("loginChooseAuthenticator")}</div>


        <form id="kc-select-credential-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <div class="ops-auth-list">
                <#if (auth.authenticationSelections)??>
                <#list auth.authenticationSelections as authenticationSelection>
                    <button class="ops-auth-item" type="submit" name="authenticationExecution" value="${authenticationSelection.authExecId}">

                        <div class="ops-auth-icon">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 2 4 5.5v6c0 4.6 3.2 8.9 8 10.5 4.8-1.6 8-5.9 8-10.5v-6L12 2Z"
                                      stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                                <path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.8"
                                      stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <div class="ops-auth-body">
                            <div class="ops-auth-heading">
                                ${msg('${authenticationSelection.displayName}')}
                            </div>
                            <div class="ops-auth-desc">
                                ${msg('${authenticationSelection.helpText}')}
                            </div>
                        </div>
                        <div class="ops-auth-fill"></div>
                        <div class="ops-auth-arrow">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="2"
                                      stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                    </button>
                </#list>
                </#if>
            </div>
        </form>

    </#if>
</@layout.registrationLayout>

