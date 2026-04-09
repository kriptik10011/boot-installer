# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all recipe-scrapers submodules (561 site-specific scrapers)
# These are dynamically imported at runtime based on URL domain
recipe_scrapers_imports = collect_submodules('recipe_scrapers')

# Collect extruct submodules (recipe-scrapers dependency for schema.org/JSON-LD)
extruct_imports = collect_submodules('extruct')

# Collect data files needed by dependencies
extruct_datas = collect_data_files('extruct')
mf2py_datas = collect_data_files('mf2py')

a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=[],
    datas=mf2py_datas + extruct_datas,
    hiddenimports=[
        'mf2py',
        'extruct',
        'platformdirs',
        # recipe-scrapers and dependencies
        'recipe_scrapers',
        'recipe_scrapers._exceptions',
        'isodate',
        'w3lib',
        # uvicorn internals
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
        # SQLAlchemy
        'sqlalchemy.sql.default_comparator',
        # Rate limiting
        'slowapi',
        # Password hashing (auth/pin.py)
        'argon2',
        'argon2.exceptions',
        'argon2._password_hasher',
        '_argon2_cffi_bindings',
        # Encrypted database (db/encrypted_database.py)
        'sqlcipher3',
        'sqlcipher3.dbapi2',
        # Date utilities (finance services)
        'dateutil',
        'dateutil.relativedelta',
    ] + recipe_scrapers_imports + extruct_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='weekly-review-backend-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
