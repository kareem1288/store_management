frappe.ui.form.on("UPI Configuration", {
	refresh(frm) {
		frm.dashboard.clear_headline();
		const testing = frm.doc.status !== "Live";
		frm.dashboard.set_headline_alert(
			testing
				? __("Testing mode creates non-chargeable QR codes. No customer amount is deducted.")
				: __("Live mode creates real payment requests. Verify the gateway URL and credentials before saving."),
			testing ? "blue" : "orange"
		);
	},
	status(frm) {
		frm.trigger("refresh");
	},
});
