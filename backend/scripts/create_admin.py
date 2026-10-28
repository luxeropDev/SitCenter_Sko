"""Create (or reset the password of) an administrator account without the demo seed.

    python -m scripts.create_admin --username admin --email admin@example.com
    python -m scripts.create_admin --username admin --email admin@example.com --password-env ADMIN_PASSWORD

The password is read from the ADMIN_PASSWORD environment variable (or the one
named by --password-env) or prompted interactively; it is never printed or logged.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

from app.core.database import SessionLocal, init_db
from app.core.security import hash_password
from app.models import User
from app.services import audit_service


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--full-name", default="Administrator")
    ap.add_argument("--password-env", default="ADMIN_PASSWORD")
    args = ap.parse_args(argv)

    password = os.environ.get(args.password_env) or getpass.getpass("Admin password (min 12 chars): ")
    if len(password) < 12:
        print("ERROR: password must be at least 12 characters")
        return 1
    init_db()
    with SessionLocal() as db:
        u = db.query(User).filter(User.username == args.username).first()
        if u is None:
            u = User(username=args.username, email=args.email.lower(), full_name=args.full_name, password_hash=hash_password(password), role="admin", is_active=True)
            db.add(u)
            db.flush()
            action = "user.created"
        else:
            u.password_hash = hash_password(password)
            u.role = "admin"
            u.is_active = True
            action = "user.updated"
        audit_service.record(db, actor=None, action=action, entity_type="user", entity_id=u.id, details={"username": u.username, "role": "admin", "source": "create_admin"})
        db.commit()
        print(f"OK: admin '{u.username}' {'created' if action == 'user.created' else 'updated'} (id={u.id})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
