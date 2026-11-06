(function () {
  "use strict";
  var F = window.RGForm;
  var U = window.RGUI;
  var el = U.el;
  var app = document.getElementById("app");

  function bookLabel(book) {
    return book.code + " — " + book.title + ", " + book.author + " (" + book.year + ")";
  }

  function rankSection(books, selects) {
    var rows = books.map(function (_, i) {
      var select = el("select", { id: "rank-" + (i + 1) }, [el("option", { value: "", text: "—" })]);
      books.forEach(function (book) {
        select.appendChild(el("option", { value: book.code, text: bookLabel(book) }));
      });
      selects.push(select);
      return el("div", { class: "field" }, [
        el("label", { for: "rank-" + (i + 1), text: U.ordinal(i + 1) + " choice" }),
        select,
      ]);
    });
    return el("section", {}, [
      el("h2", { text: "1. Rank the books" }),
      el("p", { class: "muted", text: "Rank as many as you like, best first. Leave the rest blank." }),
    ].concat(rows));
  }

  function vetoSection(books, boxes) {
    var items = books.map(function (book) {
      var box = el("input", { type: "checkbox", id: "veto-" + book.code, value: book.code });
      boxes.push(box);
      return el("div", { class: "check" }, [box, el("label", { for: "veto-" + book.code, text: bookLabel(book) })]);
    });
    return el("section", {}, [
      el("h2", { text: "2. Books you wouldn't join" }),
      el("p", { class: "muted", text: "Tick any book you would NOT take part in if it were chosen." }),
    ].concat(items));
  }

  function availabilitySection(cells, notAvailable) {
    function setAll(predicate, value) {
      cells.forEach(function (cell) {
        if (predicate(cell)) cell.box.checked = value;
      });
    }
    function toggle(predicate) {
      var group = cells.filter(predicate);
      var allOn = group.every(function (cell) { return cell.box.checked; });
      setAll(predicate, !allOn);
    }

    var head = el("tr", {}, [el("td", {})]);
    F.DAYS.forEach(function (day, d) {
      var button = el("button", { type: "button", class: "link", text: day.charAt(0) + day.slice(1).toLowerCase(),
        "aria-label": "Toggle all of " + F.DAY_NAMES[d] });
      button.addEventListener("click", function () { toggle(function (c) { return c.day === d; }); });
      head.appendChild(el("th", { scope: "col" }, [button]));
    });

    var body = el("tbody");
    F.HOURS.forEach(function (hour) {
      var label = el("button", { type: "button", class: "link", text: F.hourLabel(hour),
        "aria-label": "Toggle all " + F.hourLabel(hour) + " start times" });
      label.addEventListener("click", function () { toggle(function (c) { return c.hour === hour; }); });
      var row = el("tr", {}, [el("th", { scope: "row" }, [label])]);
      F.DAYS.forEach(function (_, d) {
        var box = el("input", { type: "checkbox", "aria-label": F.DAY_NAMES[d] + " " + F.hourLabel(hour) });
        cells.push({ day: d, hour: hour, box: box });
        row.appendChild(el("td", {}, [box]));
      });
      body.appendChild(row);
    });

    var clearButton = el("button", { type: "button", text: "Clear grid" });
    clearButton.addEventListener("click", function () { setAll(function () { return true; }, false); });

    return el("section", {}, [
      el("h2", { text: "3. When can you meet?" }),
      el("p", { class: "muted", text:
        "Tick every start time you could do. Times are US Eastern (ET) and meetings last one hour, " +
        "so 10 PM means 10–11 PM. This is a weekly pattern; the actual weeks are picked later." }),
      el("div", { class: "grid-wrap" }, [el("table", { class: "grid" }, [el("thead", {}, [head]), body])]),
      el("p", {}, [clearButton]),
      el("div", { class: "check" }, [
        notAvailable,
        el("label", { for: "not-available", text: "I'm not free at any of these times" }),
      ]),
      el("p", { class: "muted", text: "An empty grid with this box unticked leaves your earlier availability unchanged." }),
    ]);
  }

  function render(cycle) {
    var books = cycle.books || [];
    var rankSelects = [];
    var vetoBoxes = [];
    var cells = [];
    var notAvailable = el("input", { type: "checkbox", id: "not-available" });
    var out = el("div", { id: "out", "aria-live": "polite" });
    var form = el("form", { novalidate: "novalidate" }, [
      rankSection(books, rankSelects),
      vetoSection(books, vetoBoxes),
      availabilitySection(cells, notAvailable),
      el("button", { type: "submit", class: "primary", text: "Prepare email" }),
    ]);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var result = F.validateBallot(
        {
          ranking: rankSelects.map(function (s) { return s.value; }),
          wontParticipate: vetoBoxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }),
          slots: cells.filter(function (c) { return c.box.checked; }).map(function (c) { return { day: c.day, hour: c.hour }; }),
          notAvailable: notAvailable.checked,
        },
        { validCodes: books.map(function (b) { return b.code; }) }
      );
      if (result.errors.length) return U.showProblems(out, result.errors);
      U.showResult(
        out,
        {
          to: cycle.groupEmail,
          subject: "[Reading Group] Ballot " + cycle.cycle,
          body: F.buildBallotBody(cycle.cycle, result.values),
        },
        result.warnings
      );
    });

    U.clear(app);
    app.appendChild(el("p", { text: "Vote on the book for " + U.monthLabel(cycle.cycle) + " and tell us when you're free." }));
    if (cycle.deadline) app.appendChild(el("p", { class: "muted", text: "Voting closes: " + cycle.deadline }));
    app.appendChild(form);
    app.appendChild(out);
  }

  U.loadCycle()
    .then(function (cycle) {
      if (cycle.phase !== "voting") {
        return U.notice(app, "warn", "Voting isn't open right now. Check back when the ballot goes out.");
      }
      if (!cycle.groupEmail) {
        return U.notice(app, "error", "This form isn't set up yet (no group email address configured).");
      }
      if (!cycle.books || !cycle.books.length) {
        return U.notice(app, "error", "There are no books on the ballot yet.");
      }
      render(cycle);
    })
    .catch(function () {
      U.notice(app, "error", "Couldn't load this month's details. Please try again later.");
    });
})();
