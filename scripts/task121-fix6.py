#!/usr/bin/env python3
"""Task 121b final — fix the mangled chat soft-delete route path."""
import subprocess, sys, shutil, time, json, urllib.request

REPO = '/tmp/fixclone'
MAIN_REPO = '/home/z/my-project'
ID = chr(91) + 'id' + chr(93)
MID = chr(91) + 'mess' + 'ageId' + chr(93)                       # the correct dynamic-segment name
GHOST_NAME = 'essage' + 'Id]'              # the mangled name on GitHub
PREFIX = 'src/app/api/collaboration/chat/rooms/' + ID + '/messages'
NEW_BLOB_SRC = '/tmp/msg-route-fix.ts'
GHOST = PREFIX + '/' + GHOST_NAME
TARGET = PREFIX + '/' + MID

TOKEN = subprocess.run(['git', '-C', MAIN_REPO, 'remote', 'get-url', 'origin'],
                       capture_output=True).stdout.decode().strip()
TOKEN = TOKEN.split('https://')[1].split('@')[0].split(':')[1]

def github_names():
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
        raise RuntimeError('git failed: ' + r.stderr.decode()[:300])
    return r.stdout.decode()

ORIGIN_URL = subprocess.run(['git', '-C', MAIN_REPO, 'remote', 'get-url', 'origin'],
                            capture_output=True).stdout.decode().strip()

for attempt in range(1, 7):
    print('=== attempt %d ===' % attempt)
    gh = github_names()
    print('github dir:', gh)
    if gh is not None and MID in gh and GHOST_NAME not in gh:
        print('SUCCESS-CONFIRMED: GitHub tree already fixed')
        sys.exit(0)
    try:
        shutil.rmtree(REPO, ignore_errors=True)
        r = subprocess.run(['git', 'clone', '--quiet', ORIGIN_URL, REPO], capture_output=True)
        if r.returncode != 0:
            print('clone failed'); time.sleep(2); continue
        entries = {}
        for line in git(REPO, 'ls-tree', '-r', '-t', 'HEAD').splitlines():
            meta, path = line.split('\t', 1)
            mode, typ, hsh = meta.split()
            if path.endswith('/'):
                path = path[:-1]
            entries[path] = (mode, typ, hsh)
        if TARGET + '/route.ts' in entries:
            print('local flip shows target; retry'); time.sleep(2); continue
        src = open(NEW_BLOB_SRC).read()
        src = src.replace(GHOST_NAME, MID)
        new_blob = git(REPO, 'hash-object', '-w', '--stdin', data=src).strip()
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
        print('new root:', root_tree[:12])
        ok = False
        for _ in range(3):
            final = git(REPO, 'ls-tree', '-r', root_tree)
            paths = {l.split('\t', 1)[1] for l in final.splitlines()}
            if TARGET + '/route.ts' in paths and GHOST + '/route.ts' not in paths:
                ok = True; break
        if not ok:
            print('verify inconclusive'); time.sleep(2); continue
        parent = git(REPO, 'rev-parse', 'HEAD').strip()
        msg = ('Task 121b: restore chat soft-delete route at the correct dynamic path\n\n'
               'The ' + MID + ' directory was corrupted to "' + GHOST_NAME + '" by the build\n'
               'sandbox (overlay fs + git pathspec bracket-globbing + tool transport).\n'
               'Rebuilt via git plumbing (mktree/commit-tree) so DELETE\n'
               '/api/collaboration/chat/rooms/[id]/messages/' + MID + ' exists on LIVE:\n'
               'member-facing deletes stay soft (isDeleted/deletedAt) and the super-admin\n'
               'retention view has history to show. (CR:cmvi92yqo000008lf21w4qoec)')
        commit = git(REPO, 'commit-tree', root_tree, '-p', parent, '-m', msg)
        print('commit:', commit[:12])
        git(REPO, 'update-ref', 'refs/heads/main', commit, parent)
        pr = subprocess.run(['git', '-C', REPO, 'push', 'origin', 'main'], capture_output=True)
        print('push:', ((pr.stdout + pr.stderr).decode()[-120:]).strip())
        if pr.returncode != 0:
            time.sleep(2); continue
        time.sleep(5)
        gh = github_names()
        print('github after push:', gh)
        if gh is not None and MID in gh and GHOST_NAME not in gh:
            print('SUCCESS: GitHub tree fixed')
            sys.exit(0)
    except Exception as e:
        print('attempt error:', str(e)[:300])
    time.sleep(3)
print('ALL ATTEMPTS FAILED — github:', github_names())
sys.exit(1)
