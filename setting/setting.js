define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/on",
  "dojo/dom-class",
  "put-selector/put",
  "jimu/BaseWidgetSetting",
  'dijit/_WidgetsInTemplateMixin',
  "jimu/dijit/ItemSelector",
  "esri/layers/ArcGISImageServiceLayer",
  "esri/layers/MosaicRule",
  "dojo/store/Memory",
  "dijit/ConfirmDialog",
  "dijit/form/Button",
  "dijit/form/TextBox",
  "dijit/form/NumberSpinner",
  "dijit/form/Select"
], function (declare, lang, array, on, domClass, put, BaseWidgetSetting, _WidgetsInTemplateMixin,
             ItemSelector, ArcGISImageServiceLayer, MosaicRule, Memory, ConfirmDialog) {

  /**
   * ISTimeSelectSetting
   *  - Configure settings for the ISTimeSelect widget
   */
  return declare([BaseWidgetSetting, _WidgetsInTemplateMixin], {

    // BASE CLASS //
    baseClass: 'ISTimeSelectSetting',

    /**
     *
     */
    postCreate: function () {
      this.setConfig(this.config);
      // INITIALIZE SELECTION DIALOG //
      this.initializeSelectItemDialog();
    },

    /**
     *  INITIALIZE SELECTION DIALOG
     */
    initializeSelectItemDialog: function () {

      // SELECT ITEM BUTTON CLICK //
      this.selectItemBtn.on("click", lang.hitch(this, function () {

        // SELECTED ITEM //
        this.selectedItem = null;

        // DIALOG CONTENT //
        var dialogContent = put("div.item-selector-node");

        // SELECT ITEM DIALOG //
        var selectItemDlg = new ConfirmDialog({
          title: this.nls.selectImageServiceLabel,
          content: dialogContent
        });
        selectItemDlg.okButton.set("disabled", true);
        selectItemDlg.on("cancel", lang.hitch(this, function () {
          this._itemSelected();
        }));
        selectItemDlg.on("execute", lang.hitch(this, function () {
          this._itemSelected(this.selectedItem);
        }));
        domClass.add(selectItemDlg.domNode, lang.replace("{baseClass}-dlg", this));
        selectItemDlg.show();

        // ITEM SELECTOR //
        this.itemSelector = new ItemSelector({
          portalUrl: this.appConfig.portalUrl,
          itemTypes: ['Image Service']
        }, put(dialogContent, "div"));
        on(this.itemSelector, "item-selected, none-item-selected", lang.hitch(this, function (selectedItem) {
          this.selectedItem = selectedItem;
          selectItemDlg.okButton.set("disabled", (this.selectedItem == null));
        }));
        this.itemSelector.startup();

      }));

    },

    /**
     *
     * @param itemInfo
     * @private
     */
    _itemSelected: function (itemInfo) {

      this.itemInfo = itemInfo ? {
        id: itemInfo.id,
        title: itemInfo.title,
        url: itemInfo.url,
        detailsPageUrl: itemInfo.detailsPageUrl
      } : null;

      if(this.itemInfo) {

        // IMAGE SERVICE TITLE //
        this.imageServiceItemTitleInput.set("value", this.itemInfo.title);

        // IMAGE SERVICE DATE FIELDS //
        var ISLayer = new ArcGISImageServiceLayer(this.itemInfo.url);
        ISLayer.on("load", lang.hitch(this, function () {
          // ZOOM LEVEL //
          this.zoomLevelInput.set("value", this.ISLayer.minScale || 8);

          // DATE FIELD //
          var dateFieldStore = new Memory({
            idProperty: "name",
            data: array.filter(ISLayer.fields, function (field) {
              return (field.type === "esriFieldTypeDate");
            })
          });
          this.dateFieldsSelect.set("store", dateFieldStore);
          if(this.config.dateField) {
            this.dateFieldsSelect.set("value", this.config.dateField);
          }
          ISLayer.destroy();
          ISLayer = null;
        }));

      } else {
        this.imageServiceItemTitleInput.set("value", "");
        this.dateFieldsSelect._setDisplay("");
      }

    },

    /**
     *
     * @param config
     */
    setConfig: function (config) {
      this.titleInput.set("value", config.title || this.label || "");
      this._itemSelected(config.itemInfo);
    },

    /**
     *
     * @returns {{configText: string}}
     */
    getConfig: function () {
      return {
        title: this.titleInput.get("value") || this.label || "",
        itemInfo: this.itemInfo,
        dateField: this.dateFieldsSelect.get("value"),
        minZoomLevel: this.zoomLevelInput.get("value"),
        mosaicMethod: this.mosaicMethodSelect.get("value")
      };
    }
  });
});