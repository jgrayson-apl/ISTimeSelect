define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/on",
  "dojo/query",
  "dojo/dom-class",
  "dojo/date/locale",
  "dojo/date/stamp",
  "dojo/Deferred",
  "jimu/BaseWidget",
  'dijit/_WidgetsInTemplateMixin',
  "dojo/dnd/Moveable",
  "esri/arcgis/Portal",
  "jimu/LayerInfos/LayerInfos",
  "dijit/ConfirmDialog",
  "put-selector/put",
  "dojo/store/Observable",
  "dojo/store/Memory",
  "esri/layers/ArcGISImageServiceLayer",
  "esri/layers/MosaicRule",
  "esri/tasks/query",
  "esri/tasks/QueryTask",
  "esri/geometry/mathUtils",
  "dijit/Toolbar",
  "dijit/form/Button",
  "dijit/form/Select"
], function (declare, lang, array, on, query, domClass, locale, stamp, Deferred,
             BaseWidget, _WidgetsInTemplateMixin, Moveable,
             arcgisPortal, LayerInfos, ConfirmDialog, put, Observable, Memory,
             ArcGISImageServiceLayer, MosaicRule, Query, QueryTask, mathUtils) {

  /**
   * ISTimeSelect
   *  - This WAB widget allows for temporal filtering of an Image Service
   */
  return declare([BaseWidget, _WidgetsInTemplateMixin], {

    // BASE CLASS //
    baseClass: "ISTimeSelect",

    // PAN/ZOOM FACTORS //
    mapZoomFactor: 2.0,
    mapWidthPanFactor: 0.75,
    extentShrinkFactor: 0.9,

    // IS CURRENT DATE FIRST/LAST //
    isOldest: true,
    isNewest: true,

    /**
     *
     */
    postCreate: function () {
      this.inherited(arguments);

      // MAKE MOVABLE //
      new Moveable(this.containerNode, {handle: this.titleNode});

      // IMAGERY DATE SELECT //
      this.imageryDateSelect.set("store", new Memory({data: []}));
    },

    /**
     *
     */
    startup: function () {
      this.inherited(arguments);

      // VALIDATE CONFIG //
      this.hasValidConfig = this._validateConfig();
      if(this.hasValidConfig) {

        // IMAGE SERVICE LAYER //
        this.ISLayer = new ArcGISImageServiceLayer(this.config.itemInfo.url, {id: this.config.itemInfo.id, visible: false});
        this.ISLayer.on("load", lang.hitch(this, function () {
          on.once(this.ISLayer, "update-end", lang.hitch(this, function () {
            this.extentChangeHandle = on.pausable(this.map, "extent-change", lang.hitch(this, this._mapExtentChange));
            this.extentChangeHandle.pause();
          }));
          this.map.addLayer(this.ISLayer);
        }));

      } else {
        alert("Invalid config!");
      }
    },

    /**
     * VALIDATE CONFIG
     *  - WE NEED A TITLE, DETAILS ABOUT THE ITEM, A DATE FIELD, AND A MOSAIC METHOD.
     */
    _validateConfig: function () {
      // TITLE //
      var hasTitle = this.config.hasOwnProperty("title") && (this.config.title != null) && (this.config.title.length > 0);
      // ITEM INFO //
      var hasItemInfo = this.config.hasOwnProperty("itemInfo") && (this.config.itemInfo != null);
      // DATE FIELD //
      var hasDateField = this.config.hasOwnProperty("dateField") && (this.config.dateField != null && this.config.dateField.length > 0);

      // MOSAIC METHOD //
      this.mosaicMethod = this.config.mosaicMethod || MosaicRule.METHOD_LOCKRASTER;
      // MIN ZOOM LEVEL //
      this.minZoomLevel = this.config.minZoomLevel || 8;

      // VALIDATE //
      return hasTitle && hasItemInfo && hasDateField;
    },

    /**
     *  WIDGET IS OPENED
     */
    onOpen: function () {
      this.inherited(arguments);

      // INITIAL PREVIOUS INFO //
      this.previousInfo = {
        hasImagery: false,
        extent: this.map.extent,
        level: this.map.getLevel()
      };

      // UPDATE DATE CONTROLS //
      this.updateDateControls();

      // DO WE HAVE A VALID CONFIG //
      if(this.hasValidConfig) {
        // GET DATES //
        this.getImageryDates().then(lang.hitch(this, function () {
          // DISPLAY LAYER //
          this.ISLayer.show();
          if(this.extentChangeHandle) {
            // RESUME EXTENT CHANGE EVENT //
            this.extentChangeHandle.resume();
          }
        }), console.warn);
      }
    },

    /**
     * WIDGET IS CLOSED
     */
    onClose: function () {
      this.inherited(arguments);

      // UPDATE DATE CONTROLS //
      this.updateDateControls();

      // DO WE HAVE A VALID CONFIG //
      if(this.hasValidConfig) {
        // HIDE LAYER //
        this.ISLayer.hide();
        if(this.extentChangeHandle) {
          // PAUSE EXTENT CHANGE EVENT //
          this.extentChangeHandle.pause();
        }
      }
    },

    /**
     * UPDATE DATE CONTROLS BASED ON CURRENT ZOOM LEVEL, IMAGERY AVAILABILITY WITHIN CURRENT EXTENT, AND IMAGE INDEX
     *
     * @private
     */
    updateDateControls: function () {
      // VALID ZOOM LEVEL //
      var invalidZoomLevel = (this.map.getLevel() < this.minZoomLevel);
      //   IMAGERY AVAILABILITY //
      var hasImagery = this.previousInfo.hasImagery;
      // ENABLE DATE SELECT //
      this.imageryDateSelect.set("disabled", !hasImagery || invalidZoomLevel);
      // ENABLE PREV/NEXT BUTTONS //
      this.prevBtn.set("disabled", !hasImagery || invalidZoomLevel || this.isOldest);
      this.nextBtn.set("disabled", !hasImagery || invalidZoomLevel || this.isNewest);
    },

    /**
     * MAP EXTENT CHANGE EVENT
     *
     * @param evt
     * @private
     */
    _mapExtentChange: function (evt) {

      // VALID ZOOM LEVEL //
      var invalidZoomLevel = (evt.lod.level < this.minZoomLevel);
      if(!invalidZoomLevel) {
        // HAS THE MAP EXTENT CHANGED SUFFICIENT TO UPDATE THE DATES? //
        var needsUpdate = false;

        // NEEDS UPDATE BASED ON LEVEL CHANGE? //
        if(evt.levelChange) {
          if(Math.abs(evt.lod.level - this.previousInfo.level) >= this.mapZoomFactor) {
            console.info("LARGE zoom: ", evt);
            needsUpdate = true;
          }
        } else {
          // NEEDS UPDATE BASED ON PAN CHANGE? //
          var panDistance = Math.abs(mathUtils.getLength(evt.extent.getCenter(), this.previousInfo.extent.getCenter()));
          var mapWidth = (this.map.extent.getWidth() * this.mapWidthPanFactor);
          if(panDistance > mapWidth) {
            console.info("LARGE pan: ", evt);
            needsUpdate = true;
          }
        }

        // NEEDS UPDATE //
        if(needsUpdate) {
          this.getImageryDates();
        } else {
          console.info("_mapExtentChange: ", evt);
        }
      } else {
        console.info("_mapExtentChange: invalidZoomLevel: ", evt.lod.level, this.minZoomLevel)
      }
    },

    /**
     * USER CLICK ON PREVIOUS BUTTON
     *
     * @private
     */
    _onPreviousDate: function () {
      this._selectionOffset(1);
    },

    /**
     *  USER CLICK ON NEXT BUTTON
     *
     * @private
     */
    _onNextDate: function () {
      this._selectionOffset(-1);
    },

    /**
     * SELECTION OFFSET
     *  - USED BY PREV/NEXT BUTTONS
     *
     * @param offset
     * @private
     */
    _selectionOffset: function (offset) {
      var currentDateText = this.imageryDateSelect.get("value");
      var dateStore = this.imageryDateSelect.get("store");
      var selectionItem = dateStore.data[dateStore.index[+currentDateText] + offset];
      if(selectionItem) {
        this.imageryDateSelect.set("value", selectionItem.id);
      } else {
        console.info("Could not find item: ", currentDateText, selectionItem);
      }
    },

    /**
     * NEW DATE SELECTED IN DATE SELECT LIST
     *
     * @param selectedDateText
     * @private
     */
    _onDateChange: function (selectedDateText) {

      if(this.hasValidConfig) {
        // GET SELECTED ITEM //
        var imageryDatesStore = this.imageryDateSelect.get("store");
        var selectedItem = imageryDatesStore.get(selectedDateText);
        if(selectedItem) {

          // NEW MOSAIC RULE //
          var newMosaicRule = new MosaicRule();
          newMosaicRule.ascending = true;
          newMosaicRule.operation = MosaicRule.OPERATION_FIRST;
          newMosaicRule.method = this.mosaicMethod;

          // MOSAIC METHOD //
          if(newMosaicRule.method === MosaicRule.METHOD_LOCKRASTER) {
            newMosaicRule.lockRasterIds = selectedItem.lockRasterIds;
          } else {
            newMosaicRule.sortField = this.config.dateField;
            newMosaicRule.sortValue = selectedItem.queryDate;
          }
          // SET MOSAIC RULE //
          this.ISLayer.setMosaicRule(newMosaicRule);

          // SELECTION INDEX //
          var selectionIndex = imageryDatesStore.index[selectedItem.id];
          this.isOldest = (selectionIndex === (imageryDatesStore.data.length - 1));
          this.isNewest = (selectionIndex === 0);
          this.updateDateControls();
        }
      }
    },

    /**
     * RETRIEVE DATES OF IMAGERY IN CURRENT MAP EXTENT
     *
     * @private
     */
    getImageryDates: function () {
      var deferred = new Deferred();

      if(this.hasValidConfig) {
        // GET CURRENT DATE //
        var currentValue = this.imageryDateSelect.get("value");
        // CLEAR CURRENT DATE //
        this.imageryDateSelect._setDisplay("");

        // DATE QUERY //
        var dateQuery = new Query();
        dateQuery.where = "Category = 1";
        dateQuery.geometry = this.map.extent.expand(this.extentShrinkFactor);
        dateQuery.returnGeometry = false;
        dateQuery.outFields = [this.config.dateField];
        dateQuery.orderByFields = [this.config.dateField + " DESC"];

        // QUERY TASK //
        var queryTask = new QueryTask(this.ISLayer.url);
        queryTask.execute(dateQuery).then(lang.hitch(this, function (featureSet) {
          console.info("getImageryDates: ", featureSet);

          // DO WE HAVE IMAGERY IN THIS EXTENT? //
          var hasImagery = (featureSet.features.length > 0);

          // PREVIOUS INFO //
          this.previousInfo = {
            hasImagery: hasImagery,
            extent: this.map.extent,
            level: this.map.getLevel()
          };

          // IMAGERY DATES STORE //
          var imageryDatesStore = new Memory({data: []});

          // CREATE UNIQUE LIST OF DATES WITH MATCHING LOCKRASTERIDS //
          array.forEach(featureSet.features, lang.hitch(this, function (feature) {
            // IMAGE ID //
            var imageId = feature.attributes[this.ISLayer.objectIdField];
            // IMAGE DATE //
            var dateValue = feature.attributes[this.config.dateField];

            // GET STORE ENTRY FOR THIS DATE //
            var imageInfo = imageryDatesStore.get(dateValue);
            if(!imageInfo) {
              // IMAGE DATE //
              var dateObj = new Date(dateValue);

              // FORMAT DATE //
              var queryDate = locale.format(dateObj, {selector: "date", datePattern: "yyyy/MM/dd"});
              var displayDate = locale.format(dateObj, {selector: "date", datePattern: "EEE dd MMM yyyy"});

              // ADD DATE INFO //
              imageryDatesStore.add({
                id: dateValue + "",  //  - MAKE SURE IT'S A STRING SO dijit/form/Select IS OK WITH THIS DATE VALUE AS ID //
                dateValue: dateValue,
                displayDate: displayDate,
                queryDate: queryDate,
                lockRasterIds: [imageId]
              });
            } else {
              // UPDATE DATE INFO lockRasterIds //
              imageInfo.lockRasterIds.push(imageId);
              imageryDatesStore.put(imageInfo);
            }
          }));

          // SET STORE FOR DATE SELECT //
          this.imageryDateSelect.set("store", imageryDatesStore);

          // SET CURRENT TO PREVIOUS IF PREVIOUS DATE STILL EXISTS IN NEW LIST OF DATES //
          if(currentValue && (imageryDatesStore.get(currentValue) != null)) {
            this.imageryDateSelect.set("value", currentValue);
          } else {
            if(hasImagery) {
              this.imageryDateSelect.set("value", imageryDatesStore.data[0].id);
            } else {
              this.imageryDateSelect._setDisplay(this.nls.noImageryAvailable);
            }
          }

          deferred.resolve();
        }));
      } else {
        deferred.reject();
      }

      return deferred.promise;
    },

    /**
     * USER CLICKS ABOUT BUTTON
     *
     * @private
     */
    _onAboutClick: function () {

      // ABOUT DIALOG CONTENT //
      var aboutContentNode = put("div.about-content");
      put(aboutContentNode, "div", {innerHTML: this.nls.aboutContent});
      if(this.config.itemInfo) {
        put(aboutContentNode, "div a", {
          innerHTML: this.config.itemInfo.title,
          href: this.config.itemInfo.detailsPageUrl,
          target: "_blank"
        });
      }

      // ABOUT DIALOG //
      var aboutDialog = new ConfirmDialog({
        title: this.nls.aboutLabel,
        content: aboutContentNode
      });
      domClass.add(aboutDialog.domNode, lang.replace("{baseClass}-dlg", this));
      aboutDialog.show();

    }

  });
});