<#import "opstral-shell.ftl" as shell>
<@shell.opstralEmail>
${kcSanitize(msg("eventUpdatePasswordBodyHtml",event.date, event.ipAddress))?no_esc}
</@shell.opstralEmail>
