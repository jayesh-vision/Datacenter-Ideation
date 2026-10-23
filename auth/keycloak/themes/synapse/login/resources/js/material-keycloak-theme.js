window.onload = function() {
    // add ripple effect to all material buttons on the page
    document.querySelectorAll('.mdc-button').forEach(function(e) {
        mdc.ripple.MDCRipple.attachTo(e);
    });

    // initialize all text fields
    document.querySelectorAll('.mdc-text-field').forEach(function(e) {
        new mdc.textField.MDCTextField(e);
    });

    // initialize all icons
    document.querySelectorAll('.mdc-text-field__icon').forEach(function(e) {
        new mdc.textField.MDCTextFieldIcon(e);
    });

};
