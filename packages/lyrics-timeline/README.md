# @lyricflow/lyrics-timeline

Shared versioned JSON contract for LyricFlow and MyCut. Segment and word times
are absolute seconds. Exports TypeScript types, `validateProject` and `timelineSrt`.
The Python validator in `lyricflow/timeline/contract.py` enforces the same invariants.

After installing the repository's web dependencies:

```sh
npm run build --prefix packages/lyrics-timeline
cd packages/lyrics-timeline
npm pack --ignore-scripts
```

MyCut pins the resulting archive in `vendor/` as a `file:` dependency. To change
the contract, bump its version, build/pack, copy the archive to MyCut, update the
dependency and lockfile, and run both projects' checks. Do not edit its installed
`node_modules` copy independently. This package contains no model or browser APIs.
