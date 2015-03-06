package main

import (
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/monicachew/certificatetransparency"
	"github.com/mozkeeler/sunlight"
	"os"
	"runtime"
	"sync"
	"time"
)

// Flags
var ctLog string
var intermediatesOutFile string
var rootsOutFile string
var maxEntries uint64
var rootCAFile string

func init() {
	flag.StringVar(&ctLog, "ct_log", "ct_entries.log", "File containing CT log")
	flag.StringVar(&intermediatesOutFile, "intermediates_out_file", "intermediates.json", "Output JSON of intermediates")
	flag.StringVar(&rootsOutFile, "roots_out_file", "roots.json", "Output JSON of roots")
	flag.Uint64Var(&maxEntries, "max_entries", 0, "Max entries (0 means all)")
	flag.StringVar(&rootCAFile, "rootCA_file", "rootCAList.txt", "list of root CA CNs")
	runtime.GOMAXPROCS(runtime.NumCPU())
}

type issuee struct {
	DN                 string
	PEM                string
	HasNameConstraints bool
}

type issuer struct {
	DN      string
	Issuees map[string]issuee
}

func main() {
	flag.Parse()
	if flag.NArg() != 0 {
		flag.PrintDefaults()
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Starting %s\n", time.Now())
	in, err := os.Open(ctLog)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open CT log file: %s\n", err)
		flag.PrintDefaults()
		os.Exit(1)
	}
	defer in.Close()

	entriesFile := certificatetransparency.EntriesFile{in}
	fmt.Fprintf(os.Stderr, "Initialized entries %s\n", time.Now())

	intermediatesOut, err := os.OpenFile(intermediatesOutFile, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open output file %s: %s\n",
			intermediatesOutFile, err)
		flag.PrintDefaults()
		os.Exit(1)
	}

	rootsOut, err := os.OpenFile(rootsOutFile, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open output file %s: %s\n",
			rootsOutFile, err)
		flag.PrintDefaults()
		os.Exit(1)
	}
	rootCAMap := sunlight.ReadRootCAMap(rootCAFile)
	marshalled, err := json.Marshal(rootCAMap)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to convert to JSON: %s\n", err)
		os.Exit(1)
	}
	rootsOut.Write(marshalled)

	issuerMap := make(map[string]issuer)
	mapLock := new(sync.Mutex) // great opportunity for a Matlock joke

	entriesFile.Map(func(ent *certificatetransparency.EntryAndPosition, err error) {
		if err != nil {
			fmt.Fprintf(os.Stderr, "%s encountered error with entry: %s\n",
				time.Now(), err)
			return
		}

		for _, bytes := range ent.Entry.ExtraCerts {
			cert, err := x509.ParseCertificate(bytes)
			if err != nil {
				fmt.Fprintf(os.Stderr, "%s error parsing extra certificate: %s\n", time.Now(), err)
			} else {
				certIssuerDN := sunlight.DistinguishedNameToString(cert.Issuer)
				mapLock.Lock()
				_, present := issuerMap[certIssuerDN]
				if !present {
					issuerMap[certIssuerDN] = issuer{certIssuerDN, make(map[string]issuee)}
				}
				certSubjectDN := sunlight.DistinguishedNameToString(cert.Subject)
				_, present = issuerMap[certIssuerDN].Issuees[certSubjectDN]
				if !present {
					hasNameConstraints := false
					if len(cert.PermittedDNSDomains) > 0 {
						hasNameConstraints = true
					}
					pem := base64.StdEncoding.EncodeToString(cert.Raw)
					issuerMap[certIssuerDN].Issuees[certSubjectDN] = issuee{certSubjectDN, pem, hasNameConstraints}
				}
				mapLock.Unlock()
			}
		}
	}, maxEntries)

	marshalled, err = json.Marshal(issuerMap)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to convert to JSON: %s\n", err)
		os.Exit(1)
	}
	intermediatesOut.Write(marshalled)
}
