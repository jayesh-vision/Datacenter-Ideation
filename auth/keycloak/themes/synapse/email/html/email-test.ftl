<#import "opstral-shell.ftl" as shell>
<@shell.opstralEmail>
${kcSanitize(msg("emailTestBodyHtml",realmName))?no_esc}
</@shell.opstralEmail>
