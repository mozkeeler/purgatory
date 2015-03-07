#!/bin/env python

import csv

def maybePrepend(prefix, maybeEmptyString):
  if len(maybeEmptyString) > 0:
    return prefix + maybeEmptyString
  return ""

def maybeAppend(lst, maybeEmptyString):
  if len(maybeEmptyString) > 0:
    lst.append(maybeEmptyString)

with open('BuiltinCAs.csv', 'rb') as csvfile:
  reader = csv.reader(csvfile, delimiter=',', quotechar='"')
  for row in reader:
    if row[9].find("Websites") >= 0:
      organization = maybePrepend("O=", row[1])
      organizationalUnit = maybePrepend("OU=", row[2])
      commonName = maybePrepend("CN=", row[3])
      output = []
      maybeAppend(output, organization)
      maybeAppend(output, organizationalUnit)
      maybeAppend(output, commonName)
      print ", ".join(output)
