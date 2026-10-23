<#import "opstral-shell.ftl" as shell>
<@shell.opstralEmail>
${kcSanitize(msg("eventLoginErrorBodyHtml",event.date,event.ipAddress))?no_esc}
</@shell.opstralEmail>
