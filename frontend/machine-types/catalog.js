/* Permanent BELM machine-type catalog: every type has a picture.
   To use a real photo, drop <slug>.webp (or .jpg/.png) in /machine-types/ and
   set ext below. Names match Checklist Template machineType exactly. */
(function () {
  "use strict";
  var TYPES = [
    ["Reach Stacker", "reach-stacker", "webp"], ["Forklift", "forklift"], ["Mobile Crane", "mobile-crane"],
    ["Crawler Crane", "crawler-crane"], ["Tower Crane", "tower-crane"], ["Excavator", "excavator"],
    ["Wheel Loader", "wheel-loader"], ["Backhoe Loader", "backhoe-loader"], ["Skid Steer Loader", "skid-steer"],
    ["Telehandler", "telehandler"], ["Bulldozer", "bulldozer"], ["Motor Grader", "motor-grader"],
    ["Road Roller", "road-roller"], ["Dump Truck", "dump-truck"], ["Concrete Pump", "concrete-pump"],
    ["Batch Plant", "batch-plant"], ["Truck", "truck"], ["Tractor", "tractor"], ["Generator", "generator"],
    ["Compressor", "compressor"], ["Water Pump", "water-pump"], ["Hydraulic System", "hydraulic-system"]
  ].map(function (t) { return { name: t[0], slug: t[1], ext: t[2] || "svg" }; });
  function find(name) {
    var k = String(name || "").trim().toLowerCase();
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].name.toLowerCase() === k) return TYPES[i];
    return null;
  }
  window.BelmMachineTypes = {
    list: TYPES.map(function (t) { return t.name; }),
    imageFor: function (name) {
      var t = find(name);
      return "/machine-types/" + (t ? t.slug + "." + t.ext : "other-machine.svg");
    }
  };
})();
