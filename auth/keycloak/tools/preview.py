"""Builds static previews of the Synapse login (preview/*.html) from template.ftl + the login.ftl markup and the
English messages, so the design can be opened in a browser without Keycloak. Run: python3 tools/preview.py"""
import re, os
D = os.path.join(os.path.dirname(__file__), '..')
T = os.path.join(D, 'themes', 'synapse', 'login')
t = open(os.path.join(T, 'template.ftl')).read()
msgs = {}
for l in open(os.path.join(T, 'messages', 'messages_en.properties')):
    if '=' in l and not l.startswith('#'): k, v = l.rstrip('\n').split('=', 1); msgs[k] = v
for k, v in {'doLogIn': 'Sign In', 'emailAddress': 'Email Address', 'password': 'Password', 'rememberMe': 'Remember me', 'doForgotPassword': 'Forgot Password'}.items(): msgs.setdefault(k, v)
R = '../themes/synapse/login/resources'
def fill(s):
    s = s.replace('${url.resourcesPath}', R)
    return re.sub(r'\$\{msg\("([^"]+)"\)\}', lambda m: msgs.get(m.group(1), m.group(1)), s)
head = fill(t[t.index('<head>'):t.index('</head>') + 7])
head = re.sub(r'<#--.*?-->', '', head, flags=re.S)
head = re.sub(r'<#if properties\.meta.*?</#if>', '', head, flags=re.S)
head = re.sub(r'<#if properties\.styles\?has_content>.*?</#if>', ''.join(f'<link rel="stylesheet" href="{R}/{x}" />' for x in 'css/material-components-web.min.css css/bootstrap-material-design-alerts.css css/material-keycloak-theme.css'.split()), head, count=1, flags=re.S)
head = re.sub(r'<#if properties\.scripts.*?</#if>', '', head, flags=re.S); head = re.sub(r'<#if scripts\?\?>.*?</#if>', '', head, flags=re.S)
head = head.replace('<#nested "title">', 'Sign in')
body = fill(t[t.index('<main class="op-stage'):t.index('</main>') + 7])
body = re.sub(r'<#--.*?-->', '', body, flags=re.S)
body = re.sub(r'<#assign _preContainer>.*?</#assign>', '', body, flags=re.S)
body = re.sub(r'<#if _preContainer\?has_content>.*?</#if>', '', body, flags=re.S)
body = re.sub(r'<#if displayMessage && message.*?\n                    </#if>\n', '', body, flags=re.S)
body = re.sub(r'<#if displayInfo>.*?</#if>', '', body, flags=re.S)
for k in ('kcFeedbackAreaClass', 'kcFormAreaClass', 'kcFormAreaWrapperClass'): body = body.replace('${properties.%s!}' % k, '')
AZ = '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="24" viewBox="0 0 25 24" fill="none"><path fill="currentColor" d="M9.5 11.4999L11.5 13.4999L16 8.99987M20.5 11.9999C20.5 16.9083 15.146 20.4783 13.198 21.6147C12.9766 21.7439 12.8659 21.8085 12.7097 21.842C12.5884 21.868 12.4116 21.868 12.2903 21.842C12.1341 21.8085 12.0234 21.7439 11.802 21.6147C9.85396 20.4783 4.5 16.9083 4.5 11.9999V7.21747C4.5 6.41796 4.5 6.0182 4.63076 5.67457C4.74627 5.37101 4.93398 5.10015 5.17766 4.8854C5.4535 4.64231 5.8278 4.50195 6.5764 4.22122L11.9382 2.21054C12.1461 2.13258 12.25 2.0936 12.357 2.07815C12.4518 2.06444 12.5482 2.06444 12.643 2.07815C12.75 2.0936 12.8539 2.13258 13.0618 2.21054L18.4236 4.22122C19.1722 4.50195 19.5465 4.64231 19.8223 4.8854C20.066 5.10015 20.2537 5.37101 20.3692 5.67457C20.5 6.0182 20.5 6.41796 20.5 7.21747V11.9999Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
SSO = f'''<div class="ops-social-section"><div id="kc-social-providers" class="ops-social-providers"><div class="ops-social-list">
<div class="custom-social-button"><a id="social-Azure" class="azure-login-button" href="#"><div style="display:flex; gap:10px;"><span class="social-icon">{AZ}</span><span class="social-name">Sign in with Azure</span></div></a></div>
</div></div><div class="ops-social-divider-wrap"><div class="social-label ops-social-divider" style="margin-bottom:1em" role="separator">{msgs.get('identity-provider-login-label', 'Or with username or email')}</div></div></div>'''
def form(err):
    return f'''<header class="op-card__head"><h1 class="op-card__title">{msgs['doLogIn']}</h1><p class="op-card__sub">{msgs['opsWelcomeBack']}</p></header>
<form id="kc-form-login" class="form op-form login-form" onsubmit="return false">{SSO}{err}
<div class="op-field ops-field username-input-div"><label class="op-label ops-field-label" for="username">{msgs['emailAddress']}</label><div class="op-input-wrap"><input id="username" name="username" type="text" class="op-input login-text-field login-username" placeholder="{msgs['opsEmailPlaceholder']}" /></div></div>
<div class="op-field ops-field password-container form-group"><label class="op-label ops-field-label" for="password">{msgs['password']}</label><div class="op-input-wrap login-password-div"><input id="password" name="password" type="password" class="op-input login-text-field login-password" placeholder="{msgs['opsPasswordPlaceholder']}" /><label class="op-eye visibility" id="v" onclick="var x=document.getElementById('password');x.type=x.type==='password'?'text':'password'"><img class="eyeimg" alt="view" id="vi" src="{R}/img/eye-off.png" width="16" height="16" /></label></div></div>
<div class="op-options" id="kc-form-options"><label class="op-check remberMePosition" for="rememberMe"><input type="checkbox" name="rememberMe" id="rememberMe" /><span class="remberMeLabel">{msgs['rememberMe']}</span></label><a class="op-link forgot-password" href="#">{msgs['doForgotPassword']}</a></div>
<div id="kc-form-buttons"><button class="op-submit signin-button" id="kc-login" type="submit">{msgs['doLogIn']}</button></div>
</form>'''
ERR = f'<div class="alert alert-error op-alert op-alert--error"><img src="{R}/img/warning.png" alt="" /><span class="kc-feedback-text">Invalid username or password.</span></div>'
for name, err in (('login', ''), ('login-error', ERR)):
    b = body.replace('<#nested "form">', form(err))
    assert '<#' not in b and '${' not in b, re.findall(r'(<#[^>]*>|\$\{[^}]*\})', b)[:5]
    open(os.path.join(D, 'preview', f'{name}.html'), 'w').write(f'<!DOCTYPE html>\n<!-- Static preview of the Synapse Keycloak login, built by tools/preview.py -->\n<html lang="en">\n{head}\n<body class="op-body">\n{b}\n</body>\n</html>\n')
print('ok')
