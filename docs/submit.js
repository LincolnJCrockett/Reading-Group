(function () {
  "use strict";
  var F = window.RGForm;
  var U = window.RGUI;
  var app = document.getElementById("app");

  function field(id, label, control, hint) {
    var children = [el("label", { for: id, text: label }), control];
    if (hint) children.push(el("small", { class: "muted", text: hint }));
    return el("div", { class: "field" }, children);
  }
  var el = U.el;

  function render(cycle) {
    var title = el("input", { id: "title", type: "text", maxlength: "200", autocomplete: "off", required: "required" });
    var author = el("input", { id: "author", type: "text", maxlength: "200", autocomplete: "off", required: "required" });
    var year = el("input", {
      id: "year", type: "text", inputmode: "numeric", maxlength: "4", pattern: "[0-9]{4}",
      autocomplete: "off", required: "required",
    });
    var note = el("textarea", { id: "note", rows: "3", maxlength: "500" });
    var out = el("div", { id: "out", "aria-live": "polite" });
    var form = el("form", { novalidate: "novalidate" }, [
      field("title", "Title", title),
      field("author", "Author", author),
      field("year", "Year first published", year, cycle.decade ? "Must be in the " + cycle.decade + "." : ""),
      field("note", "Why this book? (optional)", note),
      el("button", { type: "submit", class: "primary", text: "Prepare email" }),
    ]);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var result = F.validateSubmission(
        { title: title.value, author: author.value, year: year.value, note: note.value },
        { decade: cycle.decade }
      );
      if (result.errors.length) return U.showProblems(out, result.errors);
      U.showResult(out, {
        to: cycle.groupEmail,
        subject: "[Reading Group] Book suggestion " + cycle.cycle,
        body: F.buildSubmitBody(cycle.cycle, result.values),
      });
    });

    U.clear(app);
    var intro = "Suggest a book for " + U.monthLabel(cycle.cycle) + ".";
    if (cycle.decade) intro += " It should have been first published in the " + cycle.decade + ".";
    app.appendChild(el("p", { text: intro }));
    if (cycle.deadline) app.appendChild(el("p", { class: "muted", text: "Suggestions close: " + cycle.deadline }));
    app.appendChild(form);
    app.appendChild(out);
  }

  U.loadCycle()
    .then(function (cycle) {
      if (cycle.phase !== "submissions") {
        return U.notice(app, "warn", "Book suggestions aren't open right now. Check back when the next call goes out.");
      }
      if (!cycle.groupEmail) {
        return U.notice(app, "error", "This form isn't set up yet (no group email address configured).");
      }
      render(cycle);
    })
    .catch(function () {
      U.notice(app, "error", "Couldn't load this month's details. Please try again later.");
    });
})();
