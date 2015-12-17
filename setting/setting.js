define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/on",
  "dojo/json",
  "dojo/dom-class",
  "put-selector/put",
  "jimu/BaseWidgetSetting",
  "dijit/_WidgetsInTemplateMixin",
  "jimu/dijit/ItemSelector",
  "jimu/dijit/LayerChooserFromMap",
  "esri/layers/ArcGISImageServiceLayer",
  "esri/layers/MosaicRule",
  "dojo/store/Memory",
  "dijit/ConfirmDialog",
  "dijit/form/Button",
  "dijit/form/TextBox",
  "dijit/form/NumberSpinner",
  "dijit/form/Select"
], function (declare, lang, array, on, json, domClass, put, BaseWidgetSetting, _WidgetsInTemplateMixin,
             ItemSelector, LayerChooserFromMap, ArcGISImageServiceLayer, MosaicRule, Memory, ConfirmDialog) {

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
      // INITIALIZE ITEM SELECTION DIALOG //
      this.initializeSelectItemDialog();
      // INITIALIZE LAYER INDEX SELECTION DIALOG //
      this.initializeSelectLayerIndexDialog();
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
          this.selectedItem = null;
          this._clearValues();
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
          this._clearValues();
        }));
        this.itemSelector.startup();

      }));

    },

    /**
     *
     * @private
     */
    _itemSelected: function () {

      if(this.selectedItem) {

        // IMAGE SERVICE TITLE //
        this.imageServiceItemTitleInput.set("value", this.selectedItem.title);

        // IMAGE SERVICE DATE FIELDS //
        var ISLayer = new ArcGISImageServiceLayer(this.selectedItem.url, {id: this.selectedItem.id});
        ISLayer.on("load", lang.hitch(this, function () {
          // ZOOM LEVEL //
          this.zoomLevelInput.set("value", ISLayer.minScale || this.config.minZoomLevel);

          // DATE FIELD //
          var dateFieldStore = new Memory({
            idProperty: "name",
            data: array.filter(ISLayer.fields, function (field) {
              return (field.type === "esriFieldTypeDate");
            })
          });
          if(dateFieldStore.data.length > 0) {
            this.dateFieldsSelect.set("store", dateFieldStore);
            if(this.config.dateField) {
              this.dateFieldsSelect.set("value", this.config.dateField);
            }
          } else {
            this.config.dateField = null;
            this.dateFieldsSelect.set("value", null);
            this.dateFieldsSelect._setDisplay(this.nls.noDateFields);
          }
          ISLayer.destroy();
          ISLayer = null;
        }));

      } else {
        this._clearValues();
      }

    },

    /**
     *
     */
    initializeSelectLayerIndexDialog: function () {

      // DISABLE SELECT LAYER INDEX BUTTON IF THERE ARE NO OTHER LAYERS IN THE MAP //
      var operationalLayer = this.map.webMapResponse.itemInfo.itemData.operationalLayers;
      this.selectLayerIndexBtn.set("disabled", operationalLayer.length === 0);

      // SELECT LAYER INDEX BUTTON CLICK //
      this.selectLayerIndexBtn.on("click", lang.hitch(this, function () {

        // OPERATIONAL LAYERS //
        var operationalLayer = this.map.webMapResponse.itemInfo.itemData.operationalLayers;
        if(operationalLayer.length > 0) {

          var dialogContent = put("div.layer-selector-node");

          // SELECT LAYER DIALOG //
          var layerChooserDlg = new ConfirmDialog({
            title: this.nls.setLayerIndexDialogTitle,
            content: dialogContent
          });
          domClass.add(layerChooserDlg.domNode, lang.replace("{baseClass}-dlg", this));
          layerChooserDlg.show();

          // SELECT LAYER //
          var layerChooser = new LayerChooserFromMap({
            multiple: false,
            showLayerFromFeatureSet: false,
            createMapResponse: this.map.webMapResponse
          }, put(dialogContent, "div"));
          layerChooser.startup();

          // LAYER SELECTED //
          on(layerChooser, "tree-click", lang.hitch(this, function (evt) {
            var selectedItems = layerChooser.getSelectedItems();
            if(selectedItems.length >0) {
              var selectedLayerInfo = selectedItems[0].layerInfo;
              var selectedLayerIndex = array.indexOf(this.map.layerIds, selectedLayerInfo.id);
              if(selectedLayerIndex > -1) {
                // ADD ABOVE SELECTED LAYER //
                this.layerIndexInput.set("value", selectedLayerIndex + 1);
              } else {
                // IF SELECTED LAYER IS GRAPHICS/FEATURE LAYER, THEN ADD TO TOP OF OTHER LAYERS //
                this.layerIndexInput.set("value", this.map.layerIds.length);
              }
              layerChooserDlg.hide();
            }
          }));
        }
      }));

    },

    /**
     *
     * @private
     */
    _clearValues: function () {
      this.imageServiceItemTitleInput.set("value", "");
      this.zoomLevelInput.set("value", this.config.minZoomLevel);
      this.dateFieldsSelect.set("value", null);
      this.dateFieldsSelect._setDisplay("");
    },

    /**
     *
     * @param config
     */
    setConfig: function (config) {
      this.titleInput.set("value", config.title || this.label || "");
      this.layerIndexInput.set("value", config.layerIndex || this.map.layerIds.length);
      this._itemSelected(config.selectedItem);
    },

    /**
     *
     * @returns {{configText: string}}
     */
    getConfig: function () {

      // REMOVE PORTAL REFERENCE //
      if(this.selectedItem) {
        delete this.selectedItem.portal;
      }

      return {
        title: this.titleInput.get("value"),
        selectedItem: this.selectedItem,
        dateField: this.dateFieldsSelect.get("value"),
        minZoomLevel: this.zoomLevelInput.get("value"),
        mosaicMethod: this.mosaicMethodSelect.get("value"),
        layerIndex: this.layerIndexInput.get("value")
      };
    }
  });
});