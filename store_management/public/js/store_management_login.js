(function () {
	function getIcons() {
		return {
			bolt: `
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M13.2 2.8 6 13.1h4.5L9.8 21.2l8.2-10.8h-4.7l-.1-7.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
				</svg>
			`,
			shield: `
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M12 3.6 5.8 6v5.5c0 4.2 2.7 8 6.2 9.4 3.5-1.4 6.2-5.2 6.2-9.4V6L12 3.6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
					<path d="m9.5 11.9 1.6 1.6 3.4-3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			`,
			chart: `
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path d="M5 19V11m7 8V6m7 13v-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
					<path d="M4 20.5h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
				</svg>
			`,
			google: `
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path fill="#EA4335" d="M12.24 10.285v3.965h5.517c-.24 1.285-.96 2.372-2.045 3.098l3.307 2.568c1.928-1.777 3.041-4.395 3.041-7.514 0-.727-.065-1.426-.185-2.117H12.24Z"/>
					<path fill="#34A853" d="M12.24 24c2.76 0 5.077-.916 6.769-2.484l-3.307-2.568c-.916.614-2.088.977-3.462.977-2.659 0-4.912-1.795-5.718-4.208H3.104v2.646A11.758 11.758 0 0 0 12.24 24Z"/>
					<path fill="#4A90E2" d="M6.522 14.717a7.07 7.07 0 0 1-.32-2.117c0-.735.112-1.452.32-2.117V7.837H3.104A11.758 11.758 0 0 0 0 12.6c0 1.9.454 3.699 1.264 5.163l5.258-3.046Z"/>
					<path fill="#FBBC05" d="M12.24 5.274c1.5 0 2.847.516 3.91 1.531l2.93-2.93C17.31 2.227 15 1.2 12.24 1.2A11.758 11.758 0 0 0 3.104 7.837l3.418 2.646c.806-2.413 3.059-4.209 5.718-4.209Z"/>
				</svg>
			`,
		};
	}

	function buildPromoPanel() {
		const icons = getIcons();
		return `
			<div class="store-login-promo">
				<div class="store-login-brand">
					<div class="store-login-badge">SM</div>
					<h1>Retail Billing</h1>
					<p>Simple billing for kirana, retail, and growing stores.</p>
				</div>

				<div class="store-login-promo-copy">
					<span class="store-login-kicker">Store Management</span>
					<h2>Fast billing. Clear reports. Less counter rush.</h2>
					<p>Sign in to manage sales, customers, and billing from one clean workspace.</p>
				</div>

				<div class="store-login-features">
					<div class="store-login-feature">
						<div class="store-login-feature-icon">${icons.bolt}</div>
						<div>
							<strong>Quick Billing</strong>
							<p>Faster counter flow with fewer clicks.</p>
						</div>
					</div>
					<div class="store-login-feature">
						<div class="store-login-feature-icon">${icons.shield}</div>
						<div>
							<strong>Safe Access</strong>
							<p>Secure access for your store team.</p>
						</div>
					</div>
					<div class="store-login-feature">
						<div class="store-login-feature-icon">${icons.chart}</div>
						<div>
							<strong>Useful Reports</strong>
							<p>Track daily business with clarity.</p>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	function getPageRoot() {
		return (
			document.querySelector(".page_content > div") ||
			document.querySelector(".page-content > div") ||
			document.querySelector(".page-content-wrapper > div") ||
			document.querySelector(".page_content .container > div") ||
			document.querySelector(".page-content .container > div") ||
			document.querySelector("main .page_content div")
		);
	}

	function injectSubtitle(head) {
		if (!head || head.querySelector(".store-login-subtitle")) return;
		const subtitle = document.createElement("p");
		subtitle.className = "store-login-subtitle";
		subtitle.textContent = "Login to continue to your billing dashboard";
		head.appendChild(subtitle);
	}

	function styleGoogleButton(button) {
		if (!button || button.dataset.storeGoogleStyled) return;
		button.dataset.storeGoogleStyled = "1";
		button.classList.add("store-google-button");
		button.innerHTML = `
			<span class="store-google-icon" aria-hidden="true">${getIcons().google}</span>
			<span>Sign in with Google</span>
		`;
	}

	function enhanceLoginCopy() {
		const loginHeading = document.querySelector(".for-login .page-card-head h4");
		if (loginHeading) loginHeading.textContent = "Welcome back";

		document.querySelectorAll(".for-login .page-card-head").forEach(injectSubtitle);

		const emailLabel = document.querySelector('label[for="login_email"]');
		if (emailLabel) emailLabel.textContent = "Email or Username";

		const emailInput = document.getElementById("login_email");
		if (emailInput) emailInput.placeholder = "Enter your email or username";

		const passwordLabel = document.querySelector('label[for="login_password"]');
		if (passwordLabel) passwordLabel.textContent = "Password";

		const passwordInput = document.getElementById("login_password");
		if (passwordInput) passwordInput.placeholder = "Enter your password";

		const loginButton = document.querySelector(".for-login .btn-login");
		if (loginButton) loginButton.textContent = "Sign In";

		const socialButtons = document.querySelectorAll(".social-login-buttons .btn");
		socialButtons.forEach((button) => {
			const text = (button.textContent || "").trim().toLowerCase();
			if (text.includes("google")) styleGoogleButton(button);
		});

		if (!document.querySelector(".store-login-footer")) {
			const footer = document.createElement("div");
			footer.className = "store-login-footer";
			footer.textContent = "Retail Billing";
			const auth = document.querySelector(".store-login-auth");
			if (auth) auth.appendChild(footer);
		}
	}

	function buildShell() {
		if (window.location.pathname !== "/login") return;
		document.body.classList.add("store-login-page");

		const pageRoot = getPageRoot();
		if (!pageRoot) return;

		if (document.querySelector(".store-login-shell")) {
			enhanceLoginCopy();
			return;
		}

		const sections = [
			".for-login",
			".for-email-login",
			".for-signup",
			".for-forgot",
			".for-login-with-email-link",
		]
			.map((selector) => pageRoot.querySelector(selector))
			.filter(Boolean);

		if (!sections.length) return;

		const shell = document.createElement("div");
		shell.className = "store-login-shell";

		const promo = document.createElement("div");
		promo.innerHTML = buildPromoPanel();

		const auth = document.createElement("div");
		auth.className = "store-login-auth";

		const authPanel = document.createElement("div");
		authPanel.className = "store-login-auth-panel";

		sections.forEach((section) => authPanel.appendChild(section));
		auth.appendChild(authPanel);

		shell.appendChild(promo.firstElementChild);
		shell.appendChild(auth);

		pageRoot.innerHTML = "";
		pageRoot.appendChild(shell);

		enhanceLoginCopy();
	}

	function boot() {
		buildShell();
		window.setTimeout(buildShell, 120);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}

	window.addEventListener("load", buildShell);
})();
