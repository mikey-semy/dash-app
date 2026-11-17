export function createTransferCommands({ rename, removeFiles, api }) {
  return {
    renameTitle: (record, title) => rename(record, { title }),
    renameFile: (record, index, name) =>
      rename(record, {
        names: record.files.map((file, position) =>
          position === index ? name : file.name,
        ),
      }),
    removeFiles: (record, indices) =>
      removeFiles(record.id, indices, record.revision),
    suggestTitle: (record, current) =>
      api(
        "/api/transfers/" +
          record.id +
          "/title-suggestion?current=" +
          encodeURIComponent(current),
      ).then((result) => result.title),
    setPublished: (record, published) =>
      api("/api/transfers/" + record.id + "/settings", { published }, "PATCH"),
  };
}
