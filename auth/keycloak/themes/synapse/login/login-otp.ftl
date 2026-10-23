<style>
.dashinput{
        padding-left: 15px;
    letter-spacing: 42px;
    border: 0;
    background-image: linear-gradient(to left, black 70%, rgba(255, 255, 255, 0) 0%);
    background-position: bottom;
    background-size: 50px 1px;
    background-repeat: repeat-x;
    background-position-x: 35px;
    width: 220px;
}
input#totp1{
     color: #36c3de;
         margin: 5px;
         height: 33px;
    width: 35px;
    font-size: 14px;
    text-align: center;
        border: 1px solid #bdbcbc;
        -moz-appearance: textfield;
 }
 input#totp1:focus{
   border: 3px solid #36c3de;
 }
  input#totp1:active{
   border: 3px solid #36c3de;
 }
 input#totp2{
     color: #36c3de;
         margin: 5px;
         height: 33px;
    width: 35px;
    font-size: 14px;
    text-align: center;
        border: 1px solid #bdbcbc;
         -moz-appearance: textfield;
 }
 input#totp2:focus{
   border: 3px solid #36c3de;
 }
  input#totp2:active{
   border: 3px solid #36c3de;
 }
 input#totp3{
     color: #36c3de;
         margin: 5px;
         height: 33px;
    width: 35px;
    font-size: 14px;
    text-align: center;
        border: 1px solid #bdbcbc;
         -moz-appearance: textfield;
 }
 input#totp3:focus{
   border: 3px solid #36c3de;
 }
  input#totp3:active{
   border: 3px solid #36c3de;
 }
 input#totp4{
     color: #36c3de;
         margin: 5px;
         height: 33px;
    width: 35px;
    font-size: 14px;
    text-align: center;
        border: 1px solid #bdbcbc;
         -moz-appearance: textfield;
 }
 input#totp4:focus{
   border: 3px solid #36c3de;
 }
  input#totp4:active{
   border: 3px solid #36c3de;
 }
 input#totp5{
     color: #36c3de;
         margin: 5px;
         height: 33px;
    width: 35px;
    font-size: 14px;
    text-align: center;
        border: 1px solid #bdbcbc;
         -moz-appearance: textfield;
 }
 input#totp5:focus{
   border: 3px solid #36c3de;
 }
  input#totp5:active{
   border: 3px solid #36c3de;
 }
 input#totp6{
     color: #36c3de;
         margin: 5px;
         height: 33px;
    width: 35px;
    font-size: 14px;
    text-align: center;
        border: 1px solid #bdbcbc;
         -moz-appearance: textfield;
 }
 input#totp6:focus{
   border: 3px solid #36c3de;
 }
  input#totp6:active{
   border: 3px solid #36c3de;
 }
 .otparea{
         position: absolute;
    top: 7em;
 }
  .green {
    border: 2px solid #36c3de !important;
}
input#totp1:focus, input#totp2:focus, input#totp3:focus, input#totp4:focus, input#totp5:focus, input#totp6:focus {
    outline: none;
}
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Firefox */
input[type=number] {
  -moz-appearance: textfield;
}

/* The code field measured 288px while Submit, Back and the form group all
   measured 338px — the .divOuter/.divInner pair around the input carried a
   width of their own, leaving the field 50px short of the buttons below it.
   Force the whole chain to the form's width so all three share one edge. */
#kc-otp-login-form .divOuter,
#kc-otp-login-form .divInner {
  width: 100%;
  max-width: 100%;
}
#kc-otp-login-form #otp {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box;
}

/* the button group sat 3em (48px) below the field — tighten to 20px */
#kc-otp-login-form .totp-button-container.mrg-top-3 {
  margin-top: 1.25em !important;
}


</style>
<#import "template.ftl" as layout>
<@layout.registrationLayout; section>
    <#if section = "title">
        ${msg("loginTitle",realm.displayName)?no_esc}


    <#elseif section = "form">
        <form id="kc-otp-login-form" class="form totp ${properties.kcFormClass!}" action="${url.loginAction}" method="post" onkeydown="enterKeySubmit(event);">
             <div class="${properties.kcFormGroupClass!}">

                <div  class="${properties.kcInputWrapperClass!}">
<div class="${properties.kcLabelClass!} <#if usernameEditDisabled??>mdc-text-field--disabled</#if>">
<label for="Code" class="enterCodeHere ${properties.kcLabelClass!}">${msg("entercodehere")}</label>
<div class="divOuter mrg-btm-0">
  <div class="divInner">
    <input maxlength="6" id="otp" name="otp" autocomplete="off" placeholder="${msg('opsTotpPlaceholder')}"  class="mdc-text-field__input partitioned ${properties.kcInputClass!}"  type="number" pattern="/^-?\d+\.?\d*$/" onKeyPress="if(this.value.length==6) return false;" autofocus />
  </div>
</div>

                    
<div class="${properties.kcLabelWrapperClass!}">
                        <#--  <label for="Code" class="mdc-floating-label ${properties.kcLabelClass!}">${msg("entercodehere")}</label>  -->
                    </div>
                    <#--  <div class="mdc-notched-outline">
                        <svg>
                            <path class="mdc-notched-outline__path"/>
                        </svg>
                    </div>
                    <div class="mdc-notched-outline__idle"></div>  -->
                </div>
            </div>
</div>
            <div class="${properties.kcFormGroupClass!} totp-button-container mrg-top-3">
                <div id="kc-form-options" class="${properties.kcFormOptionsClass!}">
                    <div class="${properties.kcFormOptionsWrapperClass!}">
                    </div>
                </div>

                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                     <div class="${properties.kcFormButtonsWrapperClass!}">
                        <input style="width:100%;     height: 2.6em;
 background: #36c3de; color: white; border:none;    padding: 0.5em;cursor:pointer;" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonLargeClass!}" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}"/>
                    </div>
                    <#--   <input style="width:48%;     height: 2.6em;
 background: #f5f6f8; color: #101010; border:none;   padding: 0.5em;cursor:pointer;" class="btn btn-primary btn-block btn-lg  kc-form-otp-cancel-button" name="cancel" id="kc-cancel" type="submit" value="${msg("doCancel")}">  -->
                   
                </div>
            </div>
</form>

        
    </#if>
   
</@layout.registrationLayout>
<script>
 function getCodeBoxElement(index) {
  return document.getElementById('totp' + index);
}
function onKeyUpEvent(index, event) {
  const eventCode = event.which || event.keyCode;
  if (getCodeBoxElement(index).value.length === 1) {
	 if (index !== 6) {
		getCodeBoxElement(index+ 1).focus();
	 } else {
		getCodeBoxElement(index).blur();
		// Submit code
		console.log('submit code ');
	 }
  }
  if (eventCode === 8 && index !== 1) {
	 getCodeBoxElement(index - 1).focus();
  }
}
function onFocusEvent(index) {
  for (item = 0; item < index; item++) {
	 const currentElement = getCodeBoxElement(item);
	 if (!currentElement.value) {
		  currentElement.focus();
		  break;
	 }
  }
}
document.querySelectorAll('input').forEach((input) => {
  input.addEventListener('blur', function() {
    this.classList.toggle('green', this.value.length > 0);
  });
});
function enterKeySubmit(event){
            if(event.keyCode === 13){
                document.getElementById("kc-otp-login-form").submit();
            }
        }
</script>
