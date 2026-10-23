<#import "template.ftl" as layout>

<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if messageHeader??>
        ${messageHeader}
        </#if>
    <#elseif section = "form">
    <div id="kc-info-message" class="${properties.kcInfoMessageClass!}">
        <p class="instruction ${properties.kcInfoMessageInstruction!}" >${message.summary}<#if requiredActions??><#list requiredActions>: <b><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#items></b></#list><#else></#if></p>
        <#if skipLink??>
        <#elseif message.summary != "Your account has been updated.">
            <#if pageRedirectUri??>
                <p><a  href="${pageRedirectUri}">${kcSanitize(msg("backToApplication"))?no_esc}</a></p>
            <#elseif actionUri??>
                <p><a  id="actionUriRedirect" href="${actionUri}">${kcSanitize(msg("proceedWithAction"))?no_esc}</a></p>
                <script type="text/javascript">
                   document.getElementById('actionUriRedirect').click();
                </script>
            <#elseif client.baseUrl??>
                <p><a  href="${client.baseUrl}">${kcSanitize(msg("backToApplication"))?no_esc}</a></p>
            </#if>
        </#if>
        <#if message.summary == "Your account has been updated.">
		<p><a  href="${client.baseUrl}">${kcSanitize(msg("backToApplication"))?no_esc}</a></p>
        </#if>
        

    </div>
    </#if>
</@layout.registrationLayout>
