"use strict";

function getJSON(path, callback) {
  var req = new XMLHttpRequest();
  req.open("GET", path, true);
  req.onreadystatechange = function() {
    if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {
      try {
        var data = JSON.parse(req.responseText);
        callback(data);
      } catch (e) {
        console.log(e);
      }
    }
  };
  req.send();
}

var node;
var link;
var radius = 8;

function tick() {
  node.attr("transform", function(d) { return "translate(" + d.x + ", " + d.y + ")"; });
  link.attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) {
        if (d.source.x == d.target.x) {
          return d.source.x;
        }
        var dx = d.target.x - d.source.x;
        var dx2 = dx * dx;
        var dy = d.target.y - d.source.y;
        var dy2 = dy * dy;
        var delta = Math.sqrt(dx2 + dy2);
        var sign = d.source.x < d.target.x ? 1 : -1;
        return d.source.x + sign * (delta - radius) / Math.sqrt(1 + (dy2 / dx2));
      })
      .attr("y2", function(d) {
        if (d.source.y == d.target.y) {
          return d.source.y;
        }
        var dx = d.target.x - d.source.x;
        var dx2 = dx * dx;
        var dy = d.target.y - d.source.y;
        var dy2 = dy * dy;
        var delta = Math.sqrt(dx2 + dy2);
        var sign = d.source.y < d.target.y ? 1 : -1;
        return d.source.y + sign * (delta - radius) / Math.sqrt(1 + (dx2 / dy2));
      });
}

function nameToIndex(name, nodes) {
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].name == name) {
      return i;
    }
  }
  return -1;
}

getJSON("roots.json", function(rootsData) {
  getJSON("intermediates.json", function(intermediatesData) {
    var roots = [];
    for (var root of Object.keys(rootsData)) {
      if (root in intermediatesData) {
        roots.push(root);
      }
    }
    $('#autocomplete').autocomplete({
      source: roots,
      minLength: 0,
      select: function(event, suggestion) {
        doForceMap(suggestion.item.value, rootsData, intermediatesData);
      }
    });
    doForceMap(location.search ? decodeURIComponent(location.search.substring(1))
                               : roots[0],
               rootsData, intermediatesData);
  });
});

function dragstart(d) {
  d.fixed = true;
}

// Takes something like "O=..., OU=..., CN=..." and returns a shorter name,
// most likely based on the text after "CN=". The wrinkle is that each of O,
// OU, and CN might not be present (although at least one of the three should
// be). Another wrinkle is that commas may appear in the value of each field.
function shortenFullName(name) {
  var cnRegexp = /CN=(.*)$/;
  var match = name.match(cnRegexp);
  if (match) {
    return match[1];
  }
  // Interestingly, if CN isn't present, OU=... is guaranteed to be last, so we
  // can use more or less the same regular expression.
  var ouRegexp = /OU=(.*)$/;
  match = name.match(ouRegexp);
  if (match) {
    return match[1];
  }
  // Same deal with O=...
  var oRegexp = /O=(.*)$/;
  match = name.match(oRegexp);
  if (match) {
    return match[1];
  }
  // Eh, I guess we tried.
  return name;
}

function newNode(name, width, height) {
  return { x: width / 2, y: height / 2, name: name };
}

function doForceMap(root, rootsMap, intermediatesMap) {
  if (!(root in intermediatesMap)) {
    console.log(root + " hasn't issued any intermediates?");
    return;
  }

  var nodes = [];
  var links = [];

  d3.select("svg")
      .remove();

  var width = window.screen.availWidth;
  var height = Math.ceil(0.75 * window.screen.availHeight);

  nodes.push(newNode(root, width, height));
  var prevNodeCount = nodes.length;
  for (var issuee of Object.keys(intermediatesMap[root])) {
    if (nameToIndex(issuee, nodes) == -1) {
      nodes.push(newNode(issuee, width, height));
    }
  }
  while (prevNodeCount != nodes.length) {
    prevNodeCount = nodes.length;
    for (var n of nodes) {
      if (!(n.name in intermediatesMap)) {
        continue;
      }
      for (var issuee of Object.keys(intermediatesMap[n.name])) {
        if (nameToIndex(issuee, nodes) == -1) {
          nodes.push(newNode(issuee, width, height));
        }
      }
    }
  }

  for (var nodeIndex in nodes) {
    if (!(nodes[nodeIndex].name in intermediatesMap)) {
      continue;
    }
    for (var issuee of Object.keys(intermediatesMap[nodes[nodeIndex].name])) {
      var targetIndex = nameToIndex(issuee, nodes);
      if (targetIndex != nodeIndex) {
        links.push({ source: nodes[nodeIndex], target: nodes[targetIndex] });
      }
    }
  }

  var force = d3.layout.force()
    .size([width, height])
    .nodes(nodes)
    .links(links)
    .linkDistance(140)
    .charge(-80)
    .theta(0.8)
    .on("tick", tick);

  var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

  svg.append("svg:defs").selectAll("marker")
    .data(["arrow"])
    .enter().append("svg:marker")
      .attr("id", String)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("orient", "auto")
      .append("svg:path")
      .attr("d", "M0,-5L10,0L0,5");

  link = svg.selectAll(".link")
    .data(links)
    .enter().append("line")
      .attr("class", "link")
      .attr("marker-end", "url(#arrow)");

  var drag = force.drag()
    .on("dragstart", dragstart);

  node = svg.selectAll(".node")
    .data(nodes)
    .enter().append("g")
      .attr("class", function(d) { return rootsMap[d.name] ? "root" : "intermediate"; })
      .call(drag);
  node.append("circle")
    .attr("r", radius)
    .append("svg:title")
    .text(function(d) { return d.name; });
  node.append("text")
    .text(function(d) { return shortenFullName(d.name); })
    .attr("transform", function(d) { return "translate(-12, -12)"; })
    .attr("font-size", "10pt")
    .on("mousedown", function(d) {
      // Putting the drag ability on just the circle does not work well
      // (there's all sorts of jitter and the circle doesn't travel as far as
      // the cursor). It works if the drag is put on the g, but then the text
      // can be dragged. This appears to prevent that.
      d3.event.cancelBubble = true;
    });

  force.start();
  document.getElementById("autocomplete").value = root;
  var search = "?" + encodeURIComponent(root);
  history.replaceState(null, "", location.origin + location.pathname + search);
}
