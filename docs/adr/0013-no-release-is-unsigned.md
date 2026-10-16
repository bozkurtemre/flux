# No release is unsigned

Every release of Flux is signed with the Developer ID and notarized by Apple. There is no
unsigned release, of any kind, for any reason: not as a fallback when a secret is missing, not
for a hotfix, not from CI. A build that cannot be signed is not published.

## What happened

0.38.0 was tagged and released from a Mac with `make release-local`, which signs, notarizes and
checks. The tag push also started the Release workflow in GitHub Actions, which had not run for
months because the account's Actions minutes had run out; they had come back. The workflow was
written to build "signed and notarized when the secrets exist, unsigned when they do not", and
this repository holds no certificate, so it built 0.38.0 unsigned and published it: the update
package to R2 and the manifest pointing at it. Copies that updated in the next eighteen minutes
installed an app with no signature, which the keychain takes for a different app, so it asked
for the password to the connection tokens.

The local release then uploaded its signed package to the same address. Nobody received it:
the update packages are served with `immutable` and a year's cache, and the CDN went on serving
the workflow's package. The manifest named the signed package's updater signature, so the
cached package no longer verified, and copies on 0.37.0 could not update at all.

0.38.1 is the same code, signed, published as a forced release so that every copy, including
those on the unsigned 0.38.0, moves to a signed build.

## The rules

- A release is made with `make release-local`. It refuses to start without the Developer ID
  certificate in the login keychain and the notarizing key, and it checks the app, the disk
  image and the app inside the update package with `codesign --verify --deep --strict`,
  `spctl` and `stapler` before anything is published. A stapled ticket alone says nothing about
  the signature; the check on the update package used to be only that.
- The Release workflow does not run unless the repository variable `RELEASE_FROM_ACTIONS` is
  `true`, and even then it refuses to build without every signing and notarizing secret. The
  unsigned path is gone from it.
- A version is published once. Its files are cached for a year at an address made of the
  version, so a second, different package for the same version is invisible to everyone. The
  release script refuses to upload a package for a version that already serves a different
  one, and after uploading it checks that the address serves exactly what it uploaded before
  publishing the manifest. A broken release is fixed by the next version.

## Consequences

Releases come from one Mac, the one with the certificate. That was already the practice; it is
now the only way. Moving releases back to CI means putting the certificate, its password and
the notarizing credentials into the repository's secrets and setting `RELEASE_FROM_ACTIONS`,
and the workflow still refuses to run with any of them missing.
