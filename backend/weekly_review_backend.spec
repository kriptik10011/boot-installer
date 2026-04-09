# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Weekly Review Backend

This creates a single executable that runs the FastAPI server.
The executable is used as a Tauri sidecar.
"""

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Get the backend directory
backend_dir = Path(SPECPATH)

# Collect all recipe-scrapers submodules (561 site-specific scrapers)
# These are dynamically imported at runtime based on URL domain
recipe_scrapers_imports = collect_submodules('recipe_scrapers')

# Collect extruct submodules (recipe-scrapers dependency for schema.org/JSON-LD)
extruct_imports = collect_submodules('extruct')

# Collect data files for extruct (RDFa context files, etc.)
extruct_datas = collect_data_files('extruct')

a = Analysis(
    ['run_server.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=extruct_datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'sqlalchemy.sql.default_comparator',
        'slowapi',
        # recipe-scrapers and dependencies
        'recipe_scrapers',
        'recipe_scrapers._exceptions',
        'isodate',
        'w3lib',
        'mf2py',
    ] + recipe_scrapers_imports + extruct_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='weekly-review-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
