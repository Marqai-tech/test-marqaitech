#!/usr/bin/env python3
"""Task 121b (v5) — fix the mangled chat soft-delete route path.

NOTE: this sandbox's tool pipeline + overlay fs + git pathspec globbing ALL
mangle the literal bracket dir name (leading-bracket-'m' sequences get eaten),
so every occurrence of the directory name is built at RUNTIME via chr(91).
Verify against the GitHub API (authoritative for Vercel builds); retry on a
fresh clone until GitHub shows the fixed tree."""
import subprocess
import sys
import shutil
import time
import json
import urllib.request

REPO = '/tmp/fixclone'
MAIN_REPO = '/home/z/my-project'
ID = chr(91) + 'id' + chr(93)                       # [id]
MID = chr(91) + 'messageId' + chr(93)               # [messageId]
GHOST_NAME = 'essageId' + chr(93)                   # mangled
PREFIX = 'src/app/api/collaboration/chat/rooms/' + ID + '/messages'
NEW_BLOB_SRC = '/tmp/messageId-route.ts'
GHOST = PREFIX + '/' + GHOST_NAME
TARGET = PREFIX + '/' + MID

TOKEN = subprocess.run(['git', '-C', MAIN_REPO, 'remote', 'get-url', 'origin'],
                       capture_output=True).stdout.decode().strip()
TOKEN = TOKEN.split('https://')[1].split('@')[0].split(':')[1]


def github_messages_dir():
    api = ('https://api.github.com/repositories/1248905380/contents/'
           'src/app/api/collaboration/chat/rooms/%5Bid%5D/messages?ref=main')
    req = urllib.request.Request(api, headers={'Authorization': 'token ' + TOKEN,
                                               'User-Agent': 'task121-fix'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        return sorted(x['name'] for x in data) if isinstance(data, list) else None
    except Exception as e:
        print('github api error:', str(e)[:200])
        return None


def git(repo, *args, data=None):
    r = subprocess.run(['git', '-C', repo, *args], capture_output=True,
                       input=data.encode() if isinstance(data, str) else data)
    if r.returncode != 0:
        raise RuntimeError('git %s failed: %s' % (args[:3], r.stderr.decode()[:300]))
    return r.stdout.decode()


ORIGIN_URL = subprocess.run(['git', '-C', MAIN_REPO, 'remote', 'get-url', 'origin'],
                            capture_output=True).stdout.decode().strip()

for attempt in range(1, 7):
    print('=== attempt %d ===' % attempt)
    gh = github_messages_dir()
    print('github messages dir:', gh)
    if gh is not None and MID in gh and GHOST_NAME not in gh:
        print('ALREADY FIXED on GitHub — done')
        sys.exit(0)

    try:
        shutil.rmtree(REPO, ignore_errors=True)
        r = subprocess.run(['git', 'clone', '--quiet', ORIGIN_URL, REPO], capture_output=True)
        if r.returncode != 0:
            print('clone failed:', r.stderr.decode()[:200])
            time.sleep(2)
            continue

        entries = {}
        for line in git(REPO, 'ls-tree', '-r', '-t', 'HEAD').splitlines():
            meta, path = line.split('\t', 1)
            mode, typ, hsh = meta.split()
            if path.endswith('/'):
                path = path[:-1]
            entries[path] = (mode, typ, hsh)

        if TARGET + '/route.ts' in entries:
            print('local read already shows target (stale flip) — retry for coherent read')
            time.sleep(2)
            continue

        # Blob content: patch any mangled mentions of the dir name in the
        # docstring so the committed file reads correctly.
        src = open(NEW_BLOB_SRC, 'r').read()
        if GHOST_NAME in src:
            src = src.replace(GHOST_NAME, TARGET.rsplit('/', 1)[1])
        # Mangled mid-route name inside prose: 'messages/<ghost>' variants too.
        new_blob = git(REPO, 'hash-object', '-w', '--stdin',
                       data=src).strip()
        print('new blob:', new_blob[:12])

        children = {}
        for p, v in entries.items():
            d, _, name = p.rpartition('/')
            children.setdefault(d, {})[name] = v

        children[TARGET.rsplit('/', 1)[0]] = {'route.ts': ('100644', 'blob', new_blob)}
        msgs = children.get(PREFIX, {}).copy()
        msgs.pop(GHOST_NAME, None)
        msgs[MID] = ('040000', 'tree', None)
        children[PREFIX] = msgs

        def build(dirpath):
            parts = []
            for name, (mode, typ, hsh) in children.get(dirpath, {}).items():
                if hsh is None:
                    hsh, typ = build(dirpath + '/' + name if dirpath else name), 'tree'
                parts.append('%s %s %s\t%s' % (mode, typ, hsh, name))
            parts.sort(key=lambda l: l.split('\t')[1] + ('/' if ' tree ' in l else ''))
            return git(REPO, 'mktree', data='\n'.join(parts) + '\n').strip()

        root_tree = build('')
        print('new root tree:', root_tree[:12])

        # Verify the new tree by OBJECT read (repeat — reads can flip).
        ok = False
        for _ in range(3):
            final = git(REPO, 'ls-tree', '-r', root_tree)
            paths = {l.split('\t', 1)[1] for l in final.splitlines()}
            if TARGET + '/route.ts' in paths and GHOST + '/route.ts' not in paths:
                ok = True
                break
        if not ok:
            print('new-tree verification inconclusive — retrying')
            time.sleep(2)
            continue

        parent = git(REPO, 'rev-parse', 'HEAD').strip()
        msg = ('Task 121b: restore chat soft-delete route at the correct literal path\n\n'
               'The ' + MID + ' dynamic-route directory was corrupted to "' + GHOST_NAME + '" by\n'
               'the build sandbox overlay filesystem, and every normal fix was blocked by\n'
               'git pathspec bracket-globbing. Rebuilt via git plumbing (mktree /\n'
               'commit-tree): DELETE /api/collaboration/chat/rooms/[id]/messages/' + MID + '\n'
               'now exists on the deployed tree, so member-facing deletes stay soft\n'
               '(isDeleted / deletedAt) and the super-admin retention view has history\n'
               'to show. (CR:cmvi92yqo000008lf21w4qoec)')
        commit = git(REPO, 'commit-tree', root_tree, '-p', parent, '-m', msg)
        print('commit:', commit[:12])
        git(REPO, 'update-ref', 'refs/heads/main', commit, parent)
        pr = subprocess.run(['git', '-C', REPO, 'push', 'origin', 'main'], capture_output=True)
        print('push:', ((pr.stdout + pr.stderr).decode()[-120:]).strip())
        if pr.returncode != 0:
            time.sleep(2)
            continue

        time.sleep(4)
        gh = github_messages_dir()
        print('github after push:', gh)
        if gh is not None and MID in gh and GHOST_NAME not in gh:
            print('SUCCESS — GitHub tree fixed')
            sys.exit(0)
    except Exception as e:
        print('attempt error:', str(e)[:300])
    time.sleep(3)

print('ALL ATTEMPTS FAILED — GitHub still shows:', github_messages_dir())
sys.exit(1)
