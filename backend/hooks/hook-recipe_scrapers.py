# PyInstaller hook for recipe-scrapers package
# Ensures all dynamically loaded modules are included

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all submodules including dynamically loaded ones
hiddenimports = collect_submodules('recipe_scrapers')

# Explicitly add settings modules that are loaded via importlib
hiddenimports += [
    'recipe_scrapers.settings',
    'recipe_scrapers.settings.default',
    'recipe_scrapers.settings.template',
]

# Collect any data files the package needs
datas = collect_data_files('recipe_scrapers')
