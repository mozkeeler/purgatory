"use strict";

function getJSON(path, callback) {
  let req = new XMLHttpRequest();
  req.open("GET", path, true);
  req.onreadystatechange = function() {
    if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {
      try {
        let data = JSON.parse(req.responseText);
        callback(data);
      } catch (e) {
        console.log(e);
      }
    }
  };
  req.send();
}

let node;
let link;

function tick() {
  node.attr("transform", function(d) { return "translate(" + d.x + ", " + d.y + ")"; });
  link.attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });
}

function nameToIndex(name, nodes) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].name == name) {
      return i;
    }
  }
  return -1;
}

getJSON("roots.json", function(rootsData) {
  getJSON("intermediates.json", function(intermediatesData) {
    let roots = [];
    for (let root of Object.keys(rootsData)) {
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

function doForceMap(root, rootsMap, intermediatesMap) {
  if (!(root in intermediatesMap)) {
    console.log(root + " hasn't issued any intermediates?");
    return;
  }

  let nodes = [];
  let links = [];

  d3.select("svg")
      .remove();

  let width = Math.ceil(0.75 * window.screen.availWidth);
  let height = Math.ceil(0.75 * window.screen.availHeight);

  let n = { x: width / 2, y: height / 2, name: root };
  nodes.push(n);
  let prevNodeCount = nodes.length;
  for (let issuee of Object.keys(intermediatesMap[root])) {
    if (nameToIndex(issuee, nodes) == -1) {
      let n = { x: width / 2, y: height / 2, name: issuee };
      nodes.push(n);
    }
  }
  while (prevNodeCount != nodes.length) {
    prevNodeCount = nodes.length;
    for (let node of nodes) {
      if (!(node.name in intermediatesMap)) {
        continue;
      }
      for (let issuee of Object.keys(intermediatesMap[node.name])) {
        if (nameToIndex(issuee, nodes) == -1) {
          let n = { x: width / 2, y: height / 2, name: issuee };
          nodes.push(n);
        }
      }
    }
  }

  for (let nodeIndex in nodes) {
    if (!(nodes[nodeIndex].name in intermediatesMap)) {
      continue;
    }
    for (let issuee of Object.keys(intermediatesMap[nodes[nodeIndex].name])) {
      let targetIndex = nameToIndex(issuee, nodes);
      links.push({ source: nodes[nodeIndex], target: nodes[targetIndex] });
    }
  }

  let force = d3.layout.force()
    .size([width, height])
    .nodes(nodes)
    .links(links)
    .linkDistance(140)
    .charge(-80)
    .theta(0.8)
    .on("tick", tick);

  let svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

  link = svg.selectAll(".link")
    .data(links)
    .enter().append("line")
      .attr("class", "link");

  let drag = force.drag()
    .on("dragstart", dragstart);

  node = svg.selectAll(".node")
    .data(nodes)
    .enter().append("g")
      .attr("class", function(d) { return rootsMap[d.name] ? "root" : "intermediate"; })
      .call(drag);
  node.append("circle")
    .attr("r", 8);
  node.append("text")
    .text(function(d) { return d.name; })
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
  let search = "?" + encodeURIComponent(root);
  history.replaceState(null, "", location.origin + location.pathname + search);
}
