<#import "template.ftl" as layout>
<@layout.registrationLayout; section>
    <#if section = "header">
        ${msg("emailVerifyTitle")}
    <#elseif section = "form">
        <div class="ops-card-title">${msg("email_confirmation")?no_esc}</div>

        <p class="instruction">
            ${msg("emailVerifyInstruction1")}
        </p>
        <p class="instruction">
            ${msg("emailVerifyInstruction2")} <a class="ops-inline-link" href="${url.loginAction}">${msg("doClickHere")}</a> ${msg("emailVerifyInstruction3")}
        </p>

        <div class="ops-back-row">
            <a class="ops-back-link" href="${url.loginUrl}">${msg("backToLogin")?no_esc}</a>
        </div>
    </#if>
</@layout.registrationLayout>
