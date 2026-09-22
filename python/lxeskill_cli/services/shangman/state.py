"""Disposable account auth files, never Agent session state or model output."""
from __future__ import annotations

import json
import os
import re
import tempfile
import time
import uuid
from pathlib import Path

from shared.process_lock import interprocess_lock
from shared.repository import state_root
from shared.workspace import artifact_root
from .auth import AuthError, Credentials, LoginToken


def atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def read_json(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object in {path.name}, got {type(payload).__name__}")
    return payload


class AuthStore:
    def __init__(self, credentials: Credentials):
        self.credentials = credentials
        self.root = state_root() / "db" / "lxeskill" / "shangman" / credentials.account_id
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.images = artifact_root() / "shangman" / "login" / credentials.account_id
        self.images.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.state_path = self.root / "state.json"

    def lock(self):
        return interprocess_lock(self.root / "auth.lock", timeout_seconds=10)

    def assert_current(self) -> None:
        # Desktop's public config revision invalidates in-flight old CLI processes too.
        if self.credentials.revision:
            settings = read_json(state_root() / "config" / "settings.json")
            current = settings.get("integrations", {}).get("shangman", {})
            if current.get("revision") != self.credentials.revision:
                raise AuthError("credentials_changed", "上马 ERP 配置已变更，请重新开始登录")

    def _delete_challenge(self, path: Path) -> None:
        path.unlink(missing_ok=True)
        (self.images / f"{path.stem}.png").unlink(missing_ok=True)

    def cleanup(self) -> None:
        for path in self.root.glob("challenge-*.json"):
            payload = read_json(path)
            if payload.get("expires_at", 0) <= time.time() or payload.get("fingerprint") != self.credentials.fingerprint:
                self._delete_challenge(path)
        for path in self.images.glob("challenge-*.png"):
            if not (self.root / f"{path.stem}.json").exists():
                path.unlink(missing_ok=True)

    def prepare(self, key: str, image: bytes) -> dict:
        with self.lock():
            self.assert_current()
            self.cleanup()
            challenge_id = "challenge-" + uuid.uuid4().hex
            expires_at = time.time() + 300
            image_path = self.images / f"{challenge_id}.png"
            with image_path.open("xb") as stream:
                os.chmod(image_path, 0o600)
                stream.write(image)
            try:
                atomic_json(self.root / f"{challenge_id}.json", {"key": key, "expires_at": expires_at, "fingerprint": self.credentials.fingerprint})
            except Exception:
                image_path.unlink(missing_ok=True)
                raise
            return {"challenge_id": challenge_id, "image_path": str(image_path.resolve()), "expires_at": expires_at}

    def consume(self, challenge_id: str) -> tuple[str, str]:
        if not re.fullmatch(r"challenge-[a-f0-9]{32}", challenge_id):
            raise AuthError("invalid_challenge", "Invalid challenge_id")
        with self.lock():
            self.assert_current()
            path = self.root / f"{challenge_id}.json"
            if not path.exists():
                raise AuthError("challenge_unavailable", "验证码不存在或已经提交，请重新获取")
            payload = read_json(path)
            # Consume before network I/O: an uncertain HTTP result must never be replayed.
            self._delete_challenge(path)
            self.cleanup()
            if payload.get("fingerprint") != self.credentials.fingerprint:
                raise AuthError("credentials_changed", "上马 ERP 凭据已变更，请重新获取验证码")
            if payload.get("expires_at", 0) <= time.time():
                raise AuthError("challenge_expired", "本地验证码已过期，请重新获取")
            epoch_path = self.root / "epoch.json"
            epoch = read_json(epoch_path)["epoch"] if epoch_path.exists() else ""
            return payload["key"], epoch

    def save(self, token: LoginToken, *, epoch: str | None = None) -> dict:
        with self.lock():
            self.assert_current()
            epoch_path = self.root / "epoch.json"
            current_epoch = read_json(epoch_path)["epoch"] if epoch_path.exists() else ""
            if epoch is not None and epoch != current_epoch:
                raise AuthError("login_cleared", "本地登录态已清除，不保存正在完成的旧登录")
            now = time.time()
            payload = {"access_token": token.value, "logged_in_at": now, "expires_at": now + token.ttl, "fingerprint": self.credentials.fingerprint}
            atomic_json(self.state_path, payload)
            return {"logged_in_at": now, "expires_at": payload["expires_at"]}

    def _load(self) -> dict | None:
        self.assert_current()
        if not self.state_path.exists():
            return None
        payload = read_json(self.state_path)
        if payload.get("fingerprint") != self.credentials.fingerprint:
            self.state_path.unlink(missing_ok=True)
            return None
        return payload

    def status(self) -> dict:
        with self.lock():
            self.cleanup()
            payload = self._load()
            valid = bool(payload and payload.get("access_token") and payload.get("expires_at", 0) > time.time())
            return {"authenticated": valid, "source": "local_file", "online_verified": False, "status": "available" if valid else "expired" if payload else "missing", "expires_at": payload.get("expires_at") if payload else None}

    def read_token(self) -> str:
        """Internal API for future HTTP callers; never return its value to the CLI."""
        with self.lock():
            payload = self._load()
            if not payload or not payload.get("access_token") or payload.get("expires_at", 0) <= time.time():
                raise AuthError("login_required", "上马 ERP 登录态缺失或过期，请运行上马登录 Skill")
            return payload["access_token"]

    def invalidate(self, rejected_token: str) -> None:
        """Do not erase a newer login when a concurrent request rejects an older token."""
        with self.lock():
            payload = self._load()
            if payload and payload.get("access_token") == rejected_token:
                self.state_path.unlink(missing_ok=True)

    def clear(self) -> None:
        with self.lock():
            self.assert_current()
            atomic_json(self.root / "epoch.json", {"epoch": uuid.uuid4().hex})
            self.state_path.unlink(missing_ok=True)
            for path in self.root.glob("challenge-*.json"):
                self._delete_challenge(path)
            self.cleanup()
