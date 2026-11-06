/* Browser-only helpers shared by the form pages. Never uses innerHTML:
 * book titles and other text come from people, so it's always set as text. */
(function () {
  "use strict";

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else if (key === "class") node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function loadCycle() {
    return fetch("cycle.json", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("cycle.json returned " + response.status);
      return response.json();
    });
  }

  // "2027-01" -> "January 2027"
  function monthLabel(cycle) {
    var m = /^(\d{4})-(\d{2})$/.exec(cycle || "");
    if (!m) return cycle || "";
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function ordinal(n) {
    var suffix = ["th", "st", "nd", "rd"];
    var v = n % 100;
    return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
  }

  function notice(container, kind, text) {
    clear(container);
    container.appendChild(el("p", { class: "notice " + kind, text: text }));
  }

  function list(items) {
    return el("ul", {}, items.map(function (text) { return el("li", { text: text }); }));
  }

  function copyText(text, textarea) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    textarea.select();
    document.execCommand("copy");
    return Promise.resolve();
  }

  // Shows the "Open email" button plus a copy-and-paste fallback.
  function showResult(container, message, warnings) {
    clear(container);
    container.appendChild(
      el("p", { class: "notice ok", text: "Looks good. Open the email below, then press Send. Nothing is sent until you do." })
    );
    if (warnings && warnings.length) {
      container.appendChild(el("p", { class: "notice warn", text: "Heads up:" }));
      container.appendChild(list(warnings));
    }
    container.appendChild(
      el("a", { class: "button", href: window.RGForm.mailtoLink(message), text: "Open email" })
    );

    var box = el("textarea", { readonly: "readonly", rows: "10", "aria-label": "Email body" });
    box.value = message.body;
    var copied = el("span", { class: "muted", role: "status" });
    var copyButton = el("button", { type: "button", text: "Copy email body" });
    copyButton.addEventListener("click", function () {
      copyText(message.body, box).then(function () {
        copied.textContent = " Copied.";
      });
    });
    container.appendChild(
      el("details", {}, [
        el("summary", { text: "Button didn't work? Send it by hand" }),
        el("p", {}, ["To: ", el("code", { text: message.to })]),
        el("p", {}, ["Subject: ", el("code", { text: message.subject })]),
        box,
        el("p", {}, [copyButton, copied]),
      ])
    );
    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showProblems(container, errors) {
    clear(container);
    container.appendChild(el("p", { class: "notice error", text: "Please fix the following:" }));
    container.appendChild(list(errors));
    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  window.RGUI = {
    el: el,
    clear: clear,
    loadCycle: loadCycle,
    monthLabel: monthLabel,
    ordinal: ordinal,
    notice: notice,
    showResult: showResult,
    showProblems: showProblems,
  };
})();
