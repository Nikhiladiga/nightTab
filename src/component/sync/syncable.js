// menu, search and searchMatch change on clicks and typing; they are not edits
const syncable = (json) => {
  let saved;
  try {
    saved = JSON.parse(json);
  } catch (error) {
    return json;
  }
  if (saved && saved.state) {
    delete saved.state.menu;
    delete saved.state.search;
    if (saved.state.header && saved.state.header.search) {
      delete saved.state.header.search.string;
    }
  }
  if (saved && Array.isArray(saved.bookmark)) {
    saved.bookmark.forEach((group) => (group.items || []).forEach((item) => { delete item.searchMatch; }));
  }
  return JSON.stringify(saved);
};

export { syncable };
