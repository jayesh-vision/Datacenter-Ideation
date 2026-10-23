<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "title">
        ${msg("errorTitle")?no_esc}
    <#elseif section = "header">
        ${msg("errorTitleHtml")?no_esc}
    <#elseif section = "form">
        <div id="kc-error-message">
            <p class="instruction"  >${(msg(message.summary))}</p>
            <#if client?has_content && client.baseUrl?has_content> 
                <p style="margin-top:10px;">
                    <a class="op-link" id="backToApplication" href="${client.baseUrl}">
                        <svg class="op-arrow-back" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M9.5 3 4.5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        ${msg("backToApplication")}
                    </a>
                </p>
            </#if> 
        </div>
    </#if>
</@layout.registrationLayout>
