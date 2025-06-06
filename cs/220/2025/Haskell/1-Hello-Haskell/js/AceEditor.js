class AceEditor extends HTMLElement {
  constructor(playbackEngine) {
    super();

    this.playbackEngine = playbackEngine;
    this.aceEditor = null;
    this.searchText = '';

    //old line numbers need to be removed before adding new ones from a comment
    this.insertLineNumbers = [];
    this.deleteLineNumbers = [];
    this.markers = [];
    this.selectedCodeBlockMarkerIds = [];
    this.newCodeMarkerIds = [];
    this.surroundingTextMarker = null;
    this.linesAboveSelection = 0;
    this.linesBelowSelection = 0;

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(this.getTemplate());
  }

  getTemplate() {
    const template = document.createElement('template');
    template.innerHTML = `
      <style>
        :host {
          height: 100%;
        }

        .ace_scrollbar {
          scrollbar-width: thin;
        }
        .ace_scrollbar::-webkit-scrollbar {
          width: .65em;
          background-color: inherit;
        }
        .ace_scrollbar::-webkit-scrollbar-thumb {
          background: dimgray;
        }

        .editor {
          display: flex;
          flex-direction: column;
          height:  calc(100% - 25px);
        }

        .selectedCodeHighlight {
          background-color: rgb(199, 224, 241);
          opacity: 0.14;
          position: absolute;
        }

        .surroundingCodeHighlight {
          background-color: rgb(158, 172, 182);
          opacity: 0.10;
          position: absolute;
        }

        .newCodeHighlight {
          position:absolute;
          z-index:10; 
          opacity: 0.6;
          border-bottom-style: dotted;
          border-bottom-width: 3px;
          border-bottom-color: rgb(33, 130, 36);
          border-bottom-left-radius: 0px;
          border-bottom-right-radius: 0px;
        }

        .insertOnLine {
          color: rgb(33, 130, 36);
          font-weight: bold;
          background-color: rgb(52, 52, 52);
        }

        .deleteOnLine {
          text-decoration-line: underline;
          text-decoration-color: red;
          text-decoration-style: solid;
          background-color: rgb(52, 52, 52);
        }

        .st-context-menu {
          position: absolute;
          background-color: #2c2c2c; 
          border: 1px solid gray; 
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5); 
          z-index: 1000;
          border-radius: 4px; 
          padding: 8px 0; 
          color: #f0f0f0; 
          font-family: Arial, sans-serif; 
          font-size: 14px; 
        }
        .st-context-menu ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .st-context-menu li {
          padding: 8px 12px;
          cursor: pointer;
          color: #f0f0f0;
        }
        .st-context-menu li:hover {
          background-color: #444; 
        }
      </style>

      <div class="fileTabs"></div>
      <div class="editor"></div>`;

    return template.content.cloneNode(true);
  }

  connectedCallback() {
    //create the file tabs
    const fileTabs = this.shadowRoot.querySelector('.fileTabs');
    const editorFileTabs = new EditorFileTabs(this.playbackEngine);
    fileTabs.appendChild(editorFileTabs);
    
    //create the ace editor
    const editor = this.shadowRoot.querySelector('.editor');
    const aceEditor = ace.edit(editor, {
      theme: this.playbackEngine.editorProperties.aceTheme, 
      value: '',
      showPrintMargin: false,
      readOnly: true,
      fontSize: this.playbackEngine.editorProperties.fontSize,
      highlightActiveLine: false,
      highlightGutterLine: false,
      scrollPastEnd: true,
      minLines: 1,
      useWorker: false,
    });

    //attach the ace editor to the shadow dom
    aceEditor.renderer.attachToShadowRoot();
    aceEditor.renderer.$cursorLayer.element.style.display = "none";
    // Disable the default context menu
    aceEditor.container.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    
      //count how many comments are in the selected text
      let numCommentsInSelection = this.getSelectedTextForSelectedTextSearch();

      //build a custom context menu
      const x = event.clientX;
      const y = event.clientY;
      
      const existingMenu = document.querySelector(".st-context-menu");
      if (existingMenu) {
          existingMenu.remove();
      }

      // Create a custom context menu
      const menu = document.createElement("div");
      menu.className = "st-context-menu";
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.innerHTML = `
        <ul>
          <li id="copyMenuItem">Copy</li>
          <li id="searchMenuItem">Filter ${numCommentsInSelection} Comments in Selection</li>
        </ul>
      `;

      // Add hover effect for menu items
      const style = document.createElement('style');
      style.textContent = `
        .st-context-menu li:hover {
          background-color: #444; 
        }
      `;
      this.shadowRoot.appendChild(menu);

      menu.querySelector('#copyMenuItem').onclick = () => {
        const selectedText = aceEditor.getSelectedText();
        if (selectedText) {
          navigator.clipboard.writeText(selectedText).then(() => {
            //console.log("Text copied to clipboard: " + selectedText);
          }).catch((err) => {
            console.error('Error copying text: ', err);
          });
        } else {
          console.log("No text selected");
        }
        menu.remove();  // Remove menu after the action
      };

      menu.querySelector('#searchMenuItem').onclick = () => {
        const selectedText = aceEditor.getSelectedText();
        if (selectedText) {
          this.notifySearchSelectedText();    
        } else {
          console.log("No text selected");
        }
        menu.remove();  // Remove menu after the action
      };

      // Add logic to close the menu when clicking outside
      const closeMenu = () => {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      };

      document.addEventListener("click", closeMenu);
    });

    //store for later
    this.aceEditor = aceEditor;

    //update the editor with the initial file contents
    this.updateForPlaybackMovement();

    //listen for search selected code shift + control + S
    document.addEventListener('keydown', (e) => {
      const keyPressed = event.key;
      const shiftPressed = event.shiftKey;
      const ctrlPressed = event.ctrlKey;
      if (ctrlPressed && shiftPressed && keyPressed === 'S') {
        this.notifySearchSelectedText();
      }
    });
  }

  disconnectedCallback() {
  }
  
  updateForCommentSelected() {
    //highlight any selected code from the selected comment
    this.addSelectedCodeAndSurroundingTextMarkers();
    //if there is an active search highlight the code
    this.highlightSearch();
  }

  updateForPlaybackMovement() {
    //update any changes to the file tabs
    const editorFileTabs = this.shadowRoot.querySelector('st-editor-file-tabs');
    editorFileTabs.createFileTabs();

    //update the code in the editor
    if(this.playbackEngine.activeFileId) {
      //if the file was deleted, clear the editor
      if(this.playbackEngine.editorState.isFileDeleted(this.playbackEngine.activeFileId)) {
        this.aceEditor.getSession().setValue('');  
      } else { //the file was not deleted
        //get the file contents and load it into ace
        const fileContents = this.playbackEngine.editorState.getFile(this.playbackEngine.activeFileId);
        this.aceEditor.getSession().setValue(fileContents);
        
        //use the file extension for syntax highlighting
        const filePath = this.playbackEngine.editorState.getFilePath(this.playbackEngine.activeFileId);
        
        //if there is a file path
        if(filePath && filePath.trim()) { 
          //if there is NOT an existing file mode for this type of file
          if(!this.playbackEngine.editorProperties.fileModes[filePath]) {
            //get the file mode for this file type
            this.playbackEngine.editorProperties.fileModes[filePath] = this.playbackEngine.editorProperties.modelist.getModeForPath(filePath);
          }
          //set the file mode type
          const fileMode = this.playbackEngine.editorProperties.fileModes[filePath];
          this.aceEditor.getSession().setMode(fileMode.mode);
        }

        //get the position in the file of the last chatacter entered
        const scrollToLine = this.playbackEngine.mostRecentChanges.fileEditLineNumber - 1;
        const scrollToColumn = this.playbackEngine.mostRecentChanges.fileEditColumn - 1;

        //if there is a comment at the end of the movement
        if(this.playbackEngine.mostRecentChanges.endedOnAComment) {
          //if there is selected code in the comment
          if(this.playbackEngine.activeComment.selectedCodeBlocks.length > 0) {
            //do nothing because the comment's selected code will be highlighted
          } else { //no selected code in the comment
            this.scrollTo(scrollToLine, scrollToColumn);
          }
        } else { //there is no comment here
          this.scrollTo(scrollToLine, scrollToColumn);
        }
      }
      //go through the markers and highlight them
      this.addChangedCodeMarkers();
    }
    //if there is an active search highlight the code
    this.highlightSearch();
  }

  scrollTo(scrollToLine, scrollToColumn) {
    if(!this.aceEditor.isRowVisible(scrollToLine + 2) || !this.aceEditor.isRowVisible(scrollToLine - 2)) {  
      this.aceEditor.renderer.scrollCursorIntoView({row: scrollToLine, column: scrollToColumn}, 0.5);
    }
  }

  updateEditorFontSize(newFontSize) {
    //update the font of the editor
    this.aceEditor.setFontSize(newFontSize);
  }

  updateHandleTextSelection(makeCodeSelectable, isEditedComment) {
    //if the code is being made selectable to highlight above/below lines
    if(makeCodeSelectable) {
      //add a listener to get changes in the selected text
      this.aceEditor.on('changeSelection', this.handleSelectionLinesAboveBelow);
      
      //remove any previous selected code
      this.clearSelectedCodeMarkers();
      this.clearSurroundingTextMarker();

      //if there is a comment with selected code
      if(isEditedComment && this.playbackEngine.activeComment && this.playbackEngine.activeComment.selectedCodeBlocks.length > 0) {
        //replace a comment's selected code blocks with actual ace selections
        this.playbackEngine.activeComment.selectedCodeBlocks.forEach(selectedCodeBlock => {
          const aceRange = new AceRange(selectedCodeBlock.startRow, selectedCodeBlock.startColumn, selectedCodeBlock.endRow, selectedCodeBlock.endColumn);
          this.aceEditor.getSelection().addRange(aceRange);
        });
        //update the lines above/below
        this.linesAboveSelection = this.playbackEngine.activeComment.linesAbove;
        this.linesBelowSelection = this.playbackEngine.activeComment.linesBelow;

        //highlight the code around the new selections
        this.handleSelectionLinesAboveBelow();
      } else { //no commment or no selected code
        //update the lines above/below to zero
        this.linesAboveSelection = 0;
        this.linesBelowSelection = 0;
      }
    } else { //the above/below highlighting is being turned off
      //remove a listener to get changes in the selected text
      this.aceEditor.off('changeSelection', this.handleSelectionLinesAboveBelow);
      //get rid of any selected context
      this.clearSurroundingTextMarker();
      this.clearSelectedCode();
    }
  }

  handleSelectionLinesAboveBelow = () => {
    //get the selected text (there might be multiple highlighted ranges)
    const selection = this.aceEditor.getSelection();
    //Ace sometimes adds empty ranges so remove them
    const ranges = selection.getAllRanges().filter(range => !range.isEmpty());
    //if there is anything selected in the editor
    if(ranges.length > 0) {
      //get the min and max line numbers where there is selected text
      let lowestLineNumber = Number.MAX_SAFE_INTEGER;
      let highestLineNumber = 0;
      ranges.forEach(range => {
        if(range.isEmpty() === false) {
          //store the smallest line number
          if(range.start.row < lowestLineNumber) {
            lowestLineNumber = range.start.row;
          }
          //store the largest line number
          if(range.end.row > highestLineNumber) {
            highestLineNumber = range.end.row
          }
        }
      });
      //create the surrounding text context markers
      const startLineNumber = lowestLineNumber - this.linesAboveSelection;
      const endLineNumber = highestLineNumber + this.linesBelowSelection;
      this.addSurroundingTextMarker(startLineNumber, endLineNumber);
    } else {
      this.clearSurroundingTextMarker();
      this.clearSelectedCodeMarkers();
    }
  }

  updateLinesAboveBelow(linesAbove, linesBelow) {
    //the user has changed the lines above/below, update the instance data
    this.linesAboveSelection = linesAbove;
    this.linesBelowSelection = linesBelow;

    //redraw the context markers
    this.handleSelectionLinesAboveBelow();
  }

  addChangedCodeMarkers() {
    //clear any recent markers
    this.clearInsertLineMarkers();
    this.clearDeleteLineMarkers();
    this.clearNewCodeMarkers();

    //highlight changes in the line numbers
    this.addInsertLineMarkers();
    this.addDeleteLineMarkers();

    //highlight the new code
    this.addNewCodeMarkers();
  }

  addSelectedCodeAndSurroundingTextMarkers() {
    //clear any old results
    this.clearSelectedCodeMarkers();
    this.clearSurroundingTextMarker();

    //if there is an active comment that has selected code highlights, highlight the code and surrounding text
    if(this.playbackEngine.activeComment && this.playbackEngine.activeComment.selectedCodeBlocks.length > 0) {
      //if the selected code is in the active file then add the highlights
      if(this.playbackEngine.activeComment.selectedCodeBlocks[0].fileId === this.playbackEngine.activeFileId) {
        //highlight the selected code
        this.addSelectedCodeMarkers();

        //add the surrounding highlights
        this.linesAboveSelection = this.playbackEngine.activeComment.linesAbove;
        this.linesBelowSelection = this.playbackEngine.activeComment.linesBelow;
        const startLineNumber = this.playbackEngine.activeComment.selectedCodeBlocks[0].startRow - this.playbackEngine.activeComment.linesAbove;
        const endLineNumber = this.playbackEngine.activeComment.selectedCodeBlocks[this.playbackEngine.activeComment.selectedCodeBlocks.length - 1].endRow + this.playbackEngine.activeComment.linesBelow;
        this.addSurroundingTextMarker(startLineNumber, endLineNumber);
      }
      //scroll to the highlighted code
      const scrollToLine = this.playbackEngine.activeComment.selectedCodeBlocks[0].startRow;
      const scrollToColumn = this.playbackEngine.activeComment.selectedCodeBlocks[0].startColumn;
      //this.aceEditor.scrollToLine(scrollToLine, true, true);
      this.scrollTo(scrollToLine, scrollToColumn);
    }
  }

  addSelectedCodeMarkers() {
    //go through each selected code block in the active comment
    this.playbackEngine.activeComment.selectedCodeBlocks.forEach(selectedCodeBlock => {
      if (selectedCodeBlock.fileId === this.playbackEngine.activeFileId) {
        //add the selected code markers and store its id for later removal
        const aceRange = new AceRange(selectedCodeBlock.startRow, selectedCodeBlock.startColumn, selectedCodeBlock.endRow, selectedCodeBlock.endColumn);
        const newMarkerId = this.aceEditor.getSession().addMarker(aceRange, 'selectedCodeHighlight', 'text', true);
        this.selectedCodeBlockMarkerIds.push(newMarkerId);
      }
    });
  }

  clearSelectedCodeMarkers() {
    //remove all the code block markers
    this.selectedCodeBlockMarkerIds.forEach(markerId => {
      this.aceEditor.getSession().removeMarker(markerId);
    });
    this.selectedCodeBlockMarkerIds = [];
  }

  addSurroundingTextMarker(startLineNumber, endLineNumber) {
    //clear any existing surrounding text
    this.clearSurroundingTextMarker();

    //create a marker in the right range
    const aceRange = new AceRange(startLineNumber, 0, endLineNumber, Number.MAX_SAFE_INTEGER);
    this.surroundingTextMarker = this.aceEditor.getSession().addMarker(aceRange, "surroundingCodeHighlight", "fullLine", true);
  }

  clearSurroundingTextMarker() {
    //if there is currently a context marker, get rid of it
    if(this.surroundingTextMarker) {
      this.aceEditor.getSession().removeMarker(this.surroundingTextMarker);
      this.surroundingTextMarker = null;
    }
  }

  addNewCodeMarkers() {
    //get the new code markers from the pb engine
    const newCodeMarkers = this.playbackEngine.getNewCodeMarkers();

    //if there any new code markers, new code is highlighted from the last pause point
    if (newCodeMarkers) {
      const activeFileNewCodeMarkers = newCodeMarkers.allNewCodeMarkers;
      if (activeFileNewCodeMarkers) {
        //add the new code highlight markers
        activeFileNewCodeMarkers.forEach(newCodeMarker => {
          //create a marker in the right range
          const aceRange = new AceRange(newCodeMarker.startRow, newCodeMarker.startColumn, newCodeMarker.endRow, newCodeMarker.endColumn);
          const newCodeMarkerId = this.aceEditor.getSession().addMarker(aceRange, "newCodeHighlight", "text", true);
          this.newCodeMarkerIds.push(newCodeMarkerId);
        });
      }
    }
  }

  clearNewCodeMarkers() {
    this.newCodeMarkerIds.forEach(markerId => {
      this.aceEditor.getSession().removeMarker(markerId);
    });
    this.newCodeMarkerIds = [];
  }

  addInsertLineMarkers() {
    //get the new code markers
    const newCodeMarkers = this.playbackEngine.getNewCodeMarkers();

    //if there are new code markers add the line number decoration
    if(newCodeMarkers) {
      newCodeMarkers.allInsertLineNumbers.forEach(lineNumber => {
        this.aceEditor.getSession().addGutterDecoration(lineNumber, "insertOnLine");
      });
      this.insertLineNumbers = newCodeMarkers.allInsertLineNumbers;
    }
  }

  clearInsertLineMarkers() {
    //remove the old insert line numbers
    this.insertLineNumbers.forEach(lineNumber => {
      this.aceEditor.getSession().removeGutterDecoration(lineNumber, "insertOnLine");
    });
    this.insertLineNumbers = [];
  }

  addDeleteLineMarkers() {
    //get the new code markers
    const newCodeMarkers = this.playbackEngine.getNewCodeMarkers();

    //if there are new code markers add the line number decoration
    if(newCodeMarkers) {
      newCodeMarkers.allDeleteLineNumbers.forEach(lineNumber => {
        this.aceEditor.getSession().addGutterDecoration(lineNumber, "deleteOnLine");
      });
      this.deleteLineNumbers = newCodeMarkers.allDeleteLineNumbers;
    }
  }

  clearDeleteLineMarkers() {
    //remove the old delete line numbers
    this.deleteLineNumbers.forEach(lineNumber => {
      this.aceEditor.getSession().removeGutterDecoration(lineNumber, "deleteOnLine");
    });
    this.deleteLineNumbers = [];
  }

  clearSelectedCode() {
    this.aceEditor.getSelection().clearSelection();
  }

  getSelectedCodeInfo() {
    //get the selected text, the surrounding text, and the lines above/below
    let selectedCode = {
      viewableBlogText: '',
      selectedCodeBlocks: [],
      linesAbove: 0,
      linesBelow: 0
    };
    
    //get the selected text from the editor (there might be multiple highlighted ranges)
    const selection = this.aceEditor.getSelection();
    //Ace sometimes adds empty ranges so remove them
    const ranges = selection.getAllRanges().filter(range => !range.isEmpty());

    //if there are any non-empty selections in the editor
    if(ranges.length > 0) {
      //get the min and max line numbers where there is selected text
      let lowestLineNumber = ranges[0].start.row;
      let highestLineNumber = ranges[ranges.length - 1].end.row;
      
      //get all of the text within the highlights
      //calculate the lines above (and adjust if it is out of the file range)
      selectedCode.linesAbove = this.linesAboveSelection;
      let surroundingTextStartRow = lowestLineNumber - this.linesAboveSelection;
      if(surroundingTextStartRow < 0) {
        surroundingTextStartRow = lowestLineNumber;
        selectedCode.linesAbove = lowestLineNumber;
      }

      //calculate the lines below (and adjust if it is out of the file range)
      selectedCode.linesBelow = this.linesBelowSelection;
      const numLinesInFile = this.playbackEngine.editorState.getNumLinesInFile(this.playbackEngine.activeFileId);
      let surroundingTextEndRow = highestLineNumber + this.linesBelowSelection;
      if(surroundingTextEndRow >= numLinesInFile) {
        surroundingTextEndRow = numLinesInFile - highestLineNumber - 1;
        selectedCode.linesBelow = surroundingTextEndRow;
      }

      //store a string with the selected and surrounding text
      selectedCode.viewableBlogText = this.aceEditor.getSession().getLines(surroundingTextStartRow, surroundingTextEndRow).join('\n');

      //now get the info about the currently selected text
      ranges.forEach(range => {
        if(range.isEmpty() === false) {
          //get the highlighted text 
          const selectedText = this.aceEditor.getSession().getTextRange(range);
          //create an object describing the selected text
          const selectedCodeBlock = {
            fileId: this.playbackEngine.activeFileId,
            selectedText: selectedText,
            selectedTextEventIds: this.playbackEngine.editorState.getEventIds(this.playbackEngine.activeFileId, range.start.row, range.start.column, range.end.row, range.end.column - 1), //ace range includes one beyond the end, exclude the end row/end col event 
            startRow: range.start.row,
            startColumn: range.start.column,
            endRow: range.end.row,
            endColumn: range.end.column
          };
          //add it to the array of all selections
          selectedCode.selectedCodeBlocks.push(selectedCodeBlock);
        }
      });
    }
    return selectedCode;
  }

  getSelectedTextRangeStrings() {
    const selection = this.aceEditor.getSelection();
    //Ace sometimes adds empty ranges so remove them
    const ranges = selection.getAllRanges().filter(range => !range.isEmpty());

    const rangeData = [];
    for(let i = 0;i < ranges.length;i++) {
      const range = ranges[i];
      //add one except for the end column to 
      rangeData.push(`line${range.start.row + 1}.${range.start.column + 1}-line${range.end.row + 1}.${range.end.column}`);
    }
    return rangeData;
  }

  getSelectedLineNumbersAndColumns() {
    let searchText = 'selected-text:';
    const rangeData = this.getSelectedTextRangeStrings();
    searchText += rangeData.join(',');
    return searchText;
  }

  getSelectedTextForSelectedTextSearch() {
    const rangeData = this.getSelectedTextRangeStrings();
    return this.playbackEngine.countCommentsInSelection(rangeData);
  }

  highlightSearch() {
    //if there is any search text to highlight
    if(this.searchText.trim() !== '') {
      //highlight the text in the editor
      this.aceEditor.findAll(this.searchText, {
        wrap: true,
        preventScroll: true,
      });
    }
  }

  updateToDisplaySearchResults(searchResults) {
    //store the search text
    this.searchText = searchResults.searchText;
    
    //if the user is searching for something
    if(this.searchText !== '') {
      //highlight whatever they entered in the search box
      this.highlightSearch();
    } else { //the search is newly empty
      //rerender the editor to get rid of all previous search results
      this.updateForPlaybackMovement();
      this.updateForCommentSelected();
    }
  }

  notifySearchSelectedText() {
    //send an event that the search functionality should be enabled
    const event = new CustomEvent('search', { 
      detail: {
        searchText: this.getSelectedLineNumbersAndColumns(),
      },
      bubbles: true, 
      composed: true 
    });
    this.dispatchEvent(event);
  }
}

window.customElements.define('st-ace-editor', AceEditor);