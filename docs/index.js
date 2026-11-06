(function () {
  "use strict";
  var U = window.RGUI;
  var status = document.getElementById("status");

  U.loadCycle()
    .then(function (cycle) {
      var month = U.monthLabel(cycle.cycle);
      if (cycle.phase === "submissions") {
        U.notice(status, "ok", "Book suggestions are open for " + month +
          (cycle.decade ? " (the " + cycle.decade + ")" : "") +
          (cycle.deadline ? ", until " + cycle.deadline : "") + ".");
      } else if (cycle.phase === "voting") {
        U.notice(status, "ok", "Voting is open for " + month +
          (cycle.deadline ? ", until " + cycle.deadline : "") + ".");
      } else {
        U.notice(status, "warn", "Nothing is open right now.");
      }
    })
    .catch(function () {
      U.notice(status, "warn", "Couldn't load the current status.");
    });
})();
