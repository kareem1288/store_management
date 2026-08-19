(() => {
  const form = document.getElementById("signup-form");
  if (!form) return;
  let currentStep = 1;
  let logoData = "";

  function showStep(step) {
    currentStep = step;
    document.querySelectorAll(".signup-step").forEach(el => el.classList.toggle("active", Number(el.dataset.step) === step));
    document.querySelectorAll(".signup-progress i").forEach((el, index) => {
      el.classList.toggle("active", index + 1 <= step);
      el.classList.toggle("done", index + 1 < step);
    });
    document.querySelectorAll(".signup-progress b").forEach((el, index) => el.classList.toggle("active", index + 1 < step));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep(step) {
    const fields = [...document.querySelector(`[data-step="${step}"]`).querySelectorAll("input:not([type=file]), select, textarea")];
    for (const field of fields) if (!field.checkValidity()) { field.reportValidity(); field.focus(); return false; }
    if (step === 1) {
      const password = form.elements.password.value;
      if (!/[A-Z]/.test(password) || !/[0-9\W]/.test(password)) {
        form.elements.password.setCustomValidity("Use at least one uppercase letter and one number or special character.");
        form.elements.password.reportValidity(); form.elements.password.setCustomValidity(""); return false;
      }
    }
    return true;
  }

  form.addEventListener("click", event => {
    if (event.target.closest(".next") && validateStep(currentStep)) showStep(currentStep + 1);
    if (event.target.closest(".previous")) showStep(currentStep - 1);
  });

  const password = form.elements.password;
  password.addEventListener("input", () => {
    const value = password.value;
    document.querySelector('[data-rule="length"]').classList.toggle("valid", value.length >= 8);
    document.querySelector('[data-rule="upper"]').classList.toggle("valid", /[A-Z]/.test(value));
    document.querySelector('[data-rule="number"]').classList.toggle("valid", /[0-9\W]/.test(value));
  });
  document.getElementById("show-password").addEventListener("click", () => password.type = password.type === "password" ? "text" : "password");

  document.getElementById("store-logo").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { event.target.value = ""; alert("Store logo must be smaller than 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { logoData = reader.result; document.getElementById("logo-label").innerHTML = `✓<b>${file.name}</b><small>Ready to upload</small>`; };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!validateStep(3)) return;
    const button = document.getElementById("submit-signup");
    const message = document.getElementById("signup-message");
    button.disabled = true; button.textContent = "Creating…"; message.textContent = "";
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.store_logo; data.store_logo = logoData;
    try {
      const response = await fetch("/api/method/store_management.signup.create_signup_details", {method:"POST", headers:{"Content-Type":"application/json", "X-Frappe-CSRF-Token": window.frappe?.csrf_token || ""}, body:JSON.stringify({data})});
      const result = await response.json();
      if (!response.ok || result.exc) throw new Error(result._server_messages ? JSON.parse(result._server_messages).map(JSON.parse).map(x => x.message).join(" ") : "Unable to create your account.");
      const details = result.message;
      document.getElementById("summary-email").textContent = details.email;
      document.getElementById("summary-store").textContent = details.store_name;
      document.getElementById("summary-country").textContent = details.country;
      const successCopy = document.querySelector(".signup-step.success > p");
      successCopy.innerHTML = `Your company and user account are ready.<br>Your free trial is active until <b>${details.trial_end_date}</b>.`;
      showStep(4);
    } catch (error) {
      message.textContent = error.message || "Something went wrong. Please try again.";
    } finally { button.disabled = false; button.textContent = "Create Account"; }
  });
})();
