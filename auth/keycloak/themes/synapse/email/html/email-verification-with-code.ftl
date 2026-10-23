<#import "opstral-shell.ftl" as shell>
<@shell.opstralEmail>
${kcSanitize(msg("emailVerificationBodyCodeHtml",code))?no_esc}
</@shell.opstralEmail>
