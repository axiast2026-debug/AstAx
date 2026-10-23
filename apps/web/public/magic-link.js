// Landing page of the magic link (ADR 0019): submits the form as soon as the
// page is there, so a tap on the link in the email is all it takes. The button
// stays for who has no script. Loaded with the page's CSP nonce.
(function () {
  var form = document.getElementById("magic-link");
  if (form && typeof form.requestSubmit === "function") form.requestSubmit();
})();
