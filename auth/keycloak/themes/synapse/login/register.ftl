
<style>

</style>

<#import "template.ftl" as layout>
<@layout.registrationLayout bodyClass="op-page-register" displayInfo=social.displayInfo; section>

    <#if section = "title">
        ${msg("emailForgotTitle")?no_esc}
    <#elseif section = "header">
        ${msg("emailForgotTitle")?no_esc}
    <#elseif section = "form">
        

            <header class="op-card__head" id="regisHeaderDiv">
                <h1 class="op-card__title">${msg("doRegister")}</h1>
                <p class="op-card__sub">${msg("opsRegisterSub")}</p>
            </header>
            
     <form autocomplete="off" name="registrationForm" id="kc-register-form" class="custom-registration-class register form ${properties.kcFormClass!}" action="${url.registrationAction}" onsubmit="changeValue()" method="post">
            <div class="mainDiv" >
                <div class="Container">

                            <div  class="ops-field ${properties.kcLabelClass!}">
                                <div class="Inputlabel">
                                    <label for="firstName" class="ops-field-label ${properties.kcLabelClass!}">${msg("firstName")?no_esc} *</label>
                                </div>
                                
                                <div class="ops-field-control">
                                    <input oninvalid="onFormInvalid(this, 'firstNameErrDiv', 'block' );" oninput="onFormInput('firstName', 'none');" required id="firstName" placeholder="${msg("opsRegFirstNamePlaceholder")}" aria-label="${msg("firstName")?no_esc}" class="login-text-field" name="firstName" type="text" autofocus value="${''}" >
                                </div>
                                <div id="firstNameErrDiv" style="display:none; position: absolute; margin-top: 6%;font-weight: 400; font-size: 75%; color: #ff5722; left: 4%;">
                                    You must enter a value
                                </div>
                            </div>

                         <div  class="ops-field ${properties.kcLabelClass!}">
                                <div  class="Inputlabel" class="${properties.kcLabelWrapperClass!}">
                                    <label for="lastName"  class="ops-field-label ${properties.kcLabelClass!}">${msg("lastName")?no_esc} *</label>
                                </div>
                              
                                <div class="ops-field-control">
                                    <input oninvalid="onFormInvalid(this, 'lastNameErrDiv', 'block' );" oninput="onFormInput('lastName', 'none');" required id="lastName" placeholder="${msg("opsRegLastNamePlaceholder")}" aria-label="${msg("lastName")?no_esc}" class="login-text-field" name="lastName" type="text" value="${''}" >
                                </div>

                                <div id="lastNameErrDiv" style="display:none; position: absolute; margin-top: 6%;font-weight: 400; font-size: 75%; color: #ff5722; left: 4%;">
                                    You must enter a value
                                </div>

                        </div>
                </div>

                <div class="Container">

                                <div  class="ops-field ${properties.kcLabelClass!}">
                                    <div class="Inputlabel" class="${properties.kcLabelWrapperClass!}">
                                        <label for="username" class="ops-field-label ${properties.kcLabelClass!}">${msg("username")?no_esc} *</label>
                                    </div>
                                    
                                    <div class="ops-field-control">
                                        <input oninvalid="onFormInvalid(this, 'usernameErrDiv', 'block' );" oninput="onFormInput('username', 'none');" required id="username" placeholder="${msg("opsRegUsernamePlaceholder")}" aria-label="${msg("username")?no_esc}" class="login-text-field" name="username" type="text" autofocus >
                                    </div>

                                    <div id="usernameErrDiv" style="display:none; position: absolute; margin-top: 6%;font-weight: 400; font-size: 75%; color: #ff5722; left: 4%;">
                                        You must enter a value
                                    </div>
                                </div>
            
                                <div  class="ops-field ${properties.kcLabelClass!} <#if usernameEditDisabled??>ops-field--disabled</#if>">
                                        
                                        <div class="Inputlabel" class="${properties.kcLabelWrapperClass!}">
                                            <label for="email" class="ops-field-label ${properties.kcLabelClass!}">${msg("email")} *</label>
                                        </div>


                                        <div class="ops-field-control">
                                            <input autocomplete="new-password" oninvalid="onFormInvalid(this, 'emailErrDiv', 'block' );" oninput="onFormInput('email', 'none');" required id="email" placeholder="${msg("opsRegEmailPlaceholder")}" aria-label="${msg("email")}" class="login-text-field" name="email" type="email" value="${''}">
                                        
                                        </div>

                                        <div id="emailErrDiv" style="display:none; position: absolute; margin-top: 6%;font-weight: 400; font-size: 75%; color: #ff5722; left: 4%;">
                                            You must enter a value
                                        </div>
                                </div>             
                </div>

                <div class="passBlock">

                        <div  class="ops-field ${properties.kcLabelClass!}">

                            <div  >
                                <label for="password1" class="ops-field-label ${properties.kcLabelClass!}">${msg("password")} *</label>
                            </div>


                            <div class="ops-field-control" data-tip="${msg("opsRegPasswordPlaceholder")}">
                                <div class="InputBox login-password-div">
                                <div >
                                    <input autocomplete="new-password" oninvalid="onFormInvalid(this, 'password1ErrDiv', 'block' );" oninput="onFormInput('password1', 'none');" required id="password1" placeholder="${msg("opsRegPasswordPlaceholder")}" aria-label="${msg("password")}" class="login-text-field login-password" name="password" type="password" value="${''}" >
                                    </div>

                                <div>
                                    <label class="visibility" id="regV" onclick="togglePassword('password1', 'regVi')"><img class="eyeimg" id="regVi" src="${url.resourcesPath}/img/eye-off.png"></label>
                                </div>
                            </div>
                            
                            </div>
                            <div id="password1ErrDiv" style="display:none; position: absolute; margin-top: 6%;font-weight: 400; font-size: 75%; color: #ff5722; left: 4%;">
                                You must enter a value
                            </div>
                        </div> 

                        <#-- Confirm Password Div-->

                         <div  class="ops-field ${properties.kcLabelClass!}">
                    
                            <div>
                                <label for="confirmpassword1" class="ops-field-label ${properties.kcLabelClass!}">${msg("passwordConfirm")} *</label>
                            </div>

                            <div class="ops-field-control" data-tip="${msg("opsRegConfirmPasswordPlaceholder")}">
                                <div class="InputBox login-password-div">

                                <div>
                                <input autocomplete="new-password" oninvalid="onFormInvalid(this, 'confirmpassword1ErrDiv', 'block' );" oninput="onFormInput('confirmpassword1', 'none');" required id="confirmpassword1" placeholder="${msg("opsRegConfirmPasswordPlaceholder")}" aria-label="${msg("passwordConfirm")}" class="login-text-field login-password" name="confirmpassword" type="password" value="${''}" >
                                </div>

                                <div>
                                    <label class="visibility" id="regV" onclick="togglePasswordConfirm('confirmpassword1', 'regVi')"><img class="eyeimg" id="regCVi" src="${url.resourcesPath}/img/eye-off.png"></label>
                                </div>
                            </div>
                            </div>
                            <div id="confirmpassword1ErrDiv" style="display:none; position: absolute; margin-top: 6%;font-weight: 400; font-size: 75%; color: #ff5722; left: 4%;">
                                You must enter a value
                            </div>
                        </div> 

                </div>

            </div>

            <div class="${properties.kcFormGroupClass!} regActionBtnStyle">
                <div id="kc-form-options" class="${properties.kcFormOptionsClass!}">
                    <div class="${properties.kcFormOptionsWrapperClass!}">
                        <span>
                            <#--  mdc-button  -->

                            <button href="${url.loginUrl}" type="button" class="cancelBtnStyle"   onclick="toggleRegistration('${url.loginUrl}')">
                                <span> Cancel </span>
                            </button>

                        </span>
                    </div>
                </div>

                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <button class="registerBtnStyle"  type="submit">
                       <label class="submitbtn"> ${msg("doRegister")?no_esc}</label>
                    </button>
                </div>

            </div>

    </form>

    </#if>

</@layout.registrationLayout>



              
       
