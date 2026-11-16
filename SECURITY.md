# Security Policy

## Supported versions

Only the latest version on the default branch is currently supported. There is
no production release yet.

## Reporting a vulnerability

Please do **not** open a public issue for a suspected security vulnerability.
Use GitHub's private vulnerability reporting feature for this repository. If
that feature is unavailable, contact the maintainer privately through the
contact details on the repository owner profile.

Please include affected commits or versions, reproduction steps, impact and any
suggested mitigation. Do not include real owner credentials, mail contents,
access tokens or unredacted personal data in the report.

We will acknowledge the report as soon as practical, investigate privately,
and coordinate a fix and disclosure timeline with the reporter.

## Scope and current limitations

The repository is in the foundation phase and is not yet safe to use for real
mail or credentials. Authentication, account storage, encryption at rest,
database access and mail rendering are not implemented yet. Do not deploy it
as a usable mail client or expose it to untrusted users.
