class PlaybackEngine {
  constructor(playbackData, startingCommentIndex, startingEventIndex) {
    //playback data
    this.playbackData = playbackData;
    
    //the state of all the files in the playback as it progresses
    this.editorState = new EditorState();

    //editor info
    this.editorProperties = {
      fontSize: 20,
      //potential ace editor themes: monokai, gruvbox, idle_fingers, pastel_on_dark, tomorrow_night, tomorrow_night_eighties, twilight
      aceTheme: 'ace/theme/tomorrow_night_eighties',
      modelist: ace.require("ace/ext/modelist"),
      fileModes: {},
      ttsSpeed: 1.0 //text to speech speed
    };

    //used to mark changes in the files
    this.newCodeMarkerGenerator = null;
    
    //used to move through events
    this.currentEventIndex = -1;

    //active dev group, file, and comment
    this.activeDevGroupId = null;
    this.activeFileId = null;
    this.activeComment = null;
    
    //used for slider bounds (there is always at least on non-relevant event at the beginning of a playback)
    this.firstRelevantEventIndex = 1;
    this.numRelevantEvents = this.playbackData.events.length - 1;

    //holds the changes from a playback engine interaction
    this.mostRecentChanges = {
      endedOnAComment: false,
      endingLocation: null,
      hasNewActiveFile: false,
      hasNewActiveDevGroup: false,
      numberOfCommentGroupsChanged: false,
      fileEditLineNumber: -1,
      fileEditColumn: -1,
      previousCommentState: {}, //most recent states of code at comment points
      currentCommentState: {},
    };

    //create aggregate info about comments
    this.updateCommentInfo();

    //count the events at the beginning that shouldn't be played back because
    //they were part of a project's initial state
    this.skipIrrelevantEvents();

    //if there was a request to start at a specific comment or event, start there
    if(startingCommentIndex) {
      this.stepToCommentByIndex(startingCommentIndex);
    } else if(startingEventIndex) {
      this.stepToEventNumber(startingEventIndex);
    }
  }

  skipIrrelevantEvents() {
    //event 0 (create project directory) is always non-relevant
    this.firstRelevantEventIndex = 1;
    this.numRelevantEvents = this.playbackData.events.length - 1;

    //find the index of the first relevant event and store it
    for (let i = 1; i < this.playbackData.events.length; i++) {
      if (this.playbackData.events[i].permanentRelevance === "never relevant") {
        //increase until a relevant event is encountered
        this.firstRelevantEventIndex++;
        //decrease the number of relevant events
        this.numRelevantEvents--;
      } else {
        break;
      }
    }
    //step through the non-relevant events to get ready for action
    this.stepForward(this.firstRelevantEventIndex, false);
  }

  //holds the types of changes that have been made
  clearMostRecentChanges() {
    this.mostRecentChanges = {
      endedOnAComment: false,
      endingLocation: null,
      hasNewActiveFile: false,
      hasNewActiveDevGroup: false,
      numberOfCommentGroupsChanged: false,
      fileEditLineNumber: -1,
      fileEditColumn: -1,
      previousCommentState: this.mostRecentChanges.currentCommentState, //use the most recent state as the previous state
      currentCommentState: this.mostRecentChanges.currentCommentState, //use the most recent state until it gets updated later
    };
  }
  
  changeActiveFileId(fileId) {
    //if the passed in file id is different than the current active file id
    if(fileId && fileId !== this.activeFileId) {
      //indicate a change and store the active file id
      this.mostRecentChanges.hasNewActiveFile = true;
      this.activeFileId = fileId;
    }
  }
  
  changeActiveComment(comment) {
    //if there is a comment passed in
    if(comment) {
      this.activeComment = comment;
    } else { //there is no comment passed in (indicating that there is not a comment at this point in the playback)
      this.activeComment = null;
    }
  }

  changeActiveDeveloperGroupId(devGroupId) {
    //if the passed in dev group id is different than the current active dev group id
    if(devGroupId && devGroupId !== this.activeDevGroupId) {
      //indicate a change and store the active dev group id
      this.mostRecentChanges.hasNewActiveDevGroup = true;
      this.activeDevGroupId = devGroupId;
    }
  }

  getMostRecentFileEdits(fromLastComment) {
    let codeChangesSummary = "";
    let currentCodeSource;
    let authorCommentText;

    //if the summary is only for the code since the last comment
    if(fromLastComment) {
      //holds the two previous states of the code
      let originalCodeSource;
      //if the last event was on a comment
      if(this.mostRecentChanges.endedOnAComment) {
        //use the state at the last two comments
        originalCodeSource = this.mostRecentChanges.previousCommentState;
        currentCodeSource = this.mostRecentChanges.currentCommentState;
        if(this.activeComment) {
          authorCommentText = this.activeComment.commentText;
        }
      } else {
        //use the most recent comment state and the current state of the files
        originalCodeSource = this.mostRecentChanges.currentCommentState;
        currentCodeSource = this.editorState.getFiles();
      }
      
      //get only the changed code
      for(const fileId in currentCodeSource) {
        const filePath = this.editorState.getFilePath(fileId);
        const codeFromCurrentState = currentCodeSource[fileId];
        const codeFromPreviousState = originalCodeSource[fileId];
        
        //if there is some code and it is different than the previous state
        if(codeFromCurrentState !== "" && codeFromPreviousState !== "" && codeFromCurrentState !== codeFromPreviousState) {
          if(codeFromPreviousState) {
            codeChangesSummary += `This is the original code:\n`;
            codeChangesSummary += `File: ${filePath}\n\n`;
            codeChangesSummary += codeFromPreviousState;
            codeChangesSummary += "\n\n";
          }

          if(codeFromCurrentState) {
            codeChangesSummary += `This is the new code:\n`;
            codeChangesSummary += `File: ${filePath}\n\n`;
            codeChangesSummary += codeFromCurrentState;
            codeChangesSummary += "\n\n";
          }
        }
      } 
    } else { //describe all of the code
      //get the code as it is in the editor now
      currentCodeSource = this.editorState.getFiles();

      codeChangesSummary = "This is the code:\n";
      for(const fileId in currentCodeSource) {
        const filePath = this.editorState.getFilePath(fileId);
        const codeFromCurrentState = currentCodeSource[fileId];

        if(codeFromCurrentState) {
          codeChangesSummary += `File: ${filePath}\n\n`;
          codeChangesSummary += codeFromCurrentState;
          codeChangesSummary += "\n\n";
        }
      }
    }

    if(authorCommentText) {
      codeChangesSummary += "The author of this code had to say this about it:\n";
      codeChangesSummary += authorCommentText;
      codeChangesSummary += "\n\n";
    }

    return codeChangesSummary;
  }

  stepForward(numberOfSteps, trackNewCodeChanges=true) {
    //reset the recent changes
    this.clearMostRecentChanges();

    //if there is any room to move forward at least one event
    if (numberOfSteps > 0 && this.currentEventIndex < this.playbackData.events.length - 1) {       
      //create a new code marker generator if the user requests one
      this.newCodeMarkerGenerator = trackNewCodeChanges ? new NewCodeMarkerGenerator() : null;

      let currentEvent;
      //step forward the requested number of steps
      for (let stepNumber = 0; stepNumber < numberOfSteps && this.currentEventIndex < this.playbackData.events.length - 1; stepNumber++) {
        //move forward before handling event
        this.currentEventIndex++;

        //playback the event
        currentEvent = this.playbackData.events[this.currentEventIndex];
        this.handleEvent(currentEvent);

        //if this event is not filtered
        if(currentEvent.relevance === "filtered out") {
          //if this event is not relevant do not count it as a complete step
          stepNumber--;
        }
      }
      //store the active developer group
      this.changeActiveDeveloperGroupId(currentEvent.createdByDevGroupId);

      //store the file where the latest event occurred (dir events will return null) 
      this.changeActiveFileId(currentEvent.fileId);

      //store the line number of the latest edit to scroll to in the playback
      if(currentEvent.type === 'INSERT' || currentEvent.type === 'DELETE') {
        this.mostRecentChanges.fileEditLineNumber = currentEvent.lineNumber;
        this.mostRecentChanges.fileEditColumn = currentEvent.column;
      }
      
      //set the position of where the playback landed
      if(this.currentEventIndex === this.firstRelevantEventIndex) {
        this.mostRecentChanges.endingLocation = 'begin';
      } else if(this.currentEventIndex === this.playbackData.events.length - 1) {
        this.mostRecentChanges.endingLocation = 'end';
      } else {
        this.mostRecentChanges.endingLocation = 'middle';
      }

      //check where the action stopped to see if there is a comment to highlight
      this.checkForCommentAtCurrentIndex();
    }
  }

  stepBackward(numberOfSteps) {
    //reset the recent changes
    this.clearMostRecentChanges();

    //if there is any room to move forward
    if (numberOfSteps > 0 && this.currentEventIndex >= this.firstRelevantEventIndex) {
      //never track changes moving backwards
      this.newCodeMarkerGenerator = null;

      let currentEvent;
      //step backward the requested number of steps
      for (let stepNumber = 0; stepNumber < numberOfSteps && this.currentEventIndex >= this.firstRelevantEventIndex; stepNumber++) {
        //playback the event
        currentEvent = this.playbackData.events[this.currentEventIndex];
        this.handleEventBackward(currentEvent);

        //if this event is not filtered
        if(currentEvent.relevance === "filtered out") {
          //if this event is not relevant do not count it as a complete step
          stepNumber--;
        }
        
        //move backward after handling event
        this.currentEventIndex--;
      }
      //store the active developer group
      this.changeActiveDeveloperGroupId(currentEvent.createdByDevGroupId);

      //store the file where the latest event occurred (dir events will return null) 
      this.changeActiveFileId(currentEvent.fileId);

      //store the line number of the latest edit to scroll to in the playback
      if(currentEvent.type === 'INSERT' || currentEvent.type === 'DELETE') {
        this.mostRecentChanges.fileEditLineNumber = currentEvent.lineNumber;
        this.mostRecentChanges.fileEditColumn = currentEvent.column;
      }

      //set the position of where the playback landed
      if(this.currentEventIndex === this.firstRelevantEventIndex) {
        this.mostRecentChanges.endingLocation = 'begin';
      } else if(this.currentEventIndex === this.playbackData.events.length - 1) {
        this.mostRecentChanges.endingLocation = 'end';
      } else {
        this.mostRecentChanges.endingLocation = 'middle';
      }
      
      //check where the action stopped to see if there is a comment to highlight
      this.checkForCommentAtCurrentIndex();
    }
  }

  stepToEventNumber(eventNumber) {
    //step to the requested event number
    const eventNumberDiff = eventNumber - this.currentEventIndex;
    
    if (eventNumberDiff > 0) {
      this.stepForward(eventNumberDiff);
    } else if (eventNumberDiff < 0) {
      this.stepBackward(-eventNumberDiff);
    } //else- it is 0 and no change is needed
  }

  stepToCommentByIndex(commentIndex) {
    //if the comment index is within the bounds of the comments
    if(commentIndex >= 0 && commentIndex < this.commentInfo.totalNumberOfComments) {
      //find the id of the requested comment and step to it
      this.stepToCommentById(this.commentInfo.flattenedComments[commentIndex].id);
    }
  }

  //move by clicking on an event
  stepToCommentById(commentId) {
    //find the comment 
    const comment = this.findCommentById(commentId);
    if(comment) {
      //step to the requested comment
      const moveToPosition = comment.displayCommentEventSequenceNumber;
      
      this.stepToEventNumber(moveToPosition);

      //if there is some selected code in the comment
      if(comment.selectedCodeBlocks.length > 0) {
        //mark the active file where the first highlighted code is
        this.changeActiveFileId(comment.selectedCodeBlocks[0].fileId);
      } else { //there is no selected code
        //mark the file where the most recent event took place as the active file
        const commentCurrentFileId = this.editorState.getFileId(comment.currentFilePath);
        if(commentCurrentFileId) {
          this.changeActiveFileId(commentCurrentFileId);
        }
      }

      //record the active comment
      this.changeActiveComment(comment);
    }
  }

  stepToNextComment() {
    //if there is a current active comment
    if(this.activeComment) {
      //holds the comment after the current active on (if there is one)
      let nextComment = null;
      //search through the ordered comments for the active one
      const allComments = this.commentInfo.flattenedComments;
      //go through all the comments where there is at least one after
      for(let i = 0;i < allComments.length - 1;i++) {
        if(allComments[i].id === this.activeComment.id) {
          //store the next comment
          nextComment = allComments[i + 1];
          break;
        }
      }
      //if there was a next comment
      if(nextComment) {
        //move to it
        this.stepToCommentById(nextComment.id);
      } else { //there was no next comment
        //go to the end
        this.stepToEnd();
      }
    } else { //not on a comment
      //find the next event position
      const nextCommentEventPos = this.findNextCommentPosition(this.currentEventIndex);
      //if there is a comment, step to it
      if(nextCommentEventPos !== -1) {
        this.stepToEventNumber(nextCommentEventPos);
      } else { //there is no next comment
        //go to the end
        this.stepToEnd();
      }
    }
  }

  stepToPreviousComment() {
    //if there is a current active comment
    if(this.activeComment) {
      //holds the comment bfore the current active on (if there is one)
      let prevComment = null;
      //search through the ordered comments for the active one
      const allComments = this.commentInfo.flattenedComments;
      //go through all the comments in reverse where there is at least one after
      for(let i = allComments.length - 1;i > 0;i--) {
        if(allComments[i].id === this.activeComment.id) {
          //store the prev comment
          prevComment = allComments[i - 1];
          break;
        }
      }
      //if there was a previous comment
      if(prevComment) {
        //move to it
        this.stepToCommentById(prevComment.id);
      } else { //there was no prev comment
        //go to the beginning
        this.stepToBeginning();
      }
    } else { //not on a comment
      //find the previous event position
      const prevCommentEventPos = this.findPreviousCommentPosition(this.currentEventIndex);
      //if there is a comment, step to it
      if(prevCommentEventPos !== -1) {
        this.stepToEventNumber(prevCommentEventPos);
      } else { //there is no prev comment
        //go to the beginning
        this.stepToBeginning();
      }
    }
  }

  stepToBeginning() {
    //go back to the beginning of the playback
    this.stepToEventNumber(this.firstRelevantEventIndex - 1);
  }

  stepToEnd() {
    //go to the end of the playback
    this.stepToEventNumber(this.playbackData.events.length - 1);
  }

  updateCommentInfo() {
    //clear out any old data
    this.commentInfo = {
      totalNumberOfComments: 0,
      allTags: [],
      allCommentsInGroups: [],
      commentGroupPositions: [],
      flattenedComments: [],
      selectedEventIdsFromComments: {} //maps selected comment event ids to comment ids
    };

    //holds the groups for sorting
    const orderedCommentGroups = [];
    
    //go through all of the comments
    for(let eventId in this.playbackData.comments) {
      //get the group of comments at an event
      const commentsAtEvent = this.playbackData.comments[eventId];
      
      //go through the comments at a single pause point
      for(let i = 0;i < commentsAtEvent.length;i++) {
        //get one comment at a time
        const comment = commentsAtEvent[i];

        //go through each block of selected code
        for (let i = 0; i < comment.selectedCodeBlocks.length; i++) {
          const block = comment.selectedCodeBlocks[i];
          for (let j = 0; block.selectedTextEventIds && j < block.selectedTextEventIds.length; j++) {
            const selectedCodeEventId = block.selectedTextEventIds[j];
            //associate the selected event id with the comment it is in
            this.commentInfo.selectedEventIdsFromComments[selectedCodeEventId] = comment.id;
          }
        }
      }

      //create groups of comments and where they land in the sequence of events
      orderedCommentGroups.push({
        comments: commentsAtEvent, 
        eventSequenceNumber: commentsAtEvent[0].displayCommentEventSequenceNumber
      });
    }
    
    //sort the groups of events by event sequence position
    orderedCommentGroups.sort((first, second) => {
      return first.eventSequenceNumber - second.eventSequenceNumber;
    });

    //used to hold distinct comment tags
    const distinctCommentTags = new Set();

    //go through each group of comments
    orderedCommentGroups.forEach(commentGroup => {
      //go through each comment in this group
      commentGroup.comments.forEach(comment => {
        //increase the comment count
        this.commentInfo.totalNumberOfComments++;
        
        //add all tags to a set to ignores duplicates
        comment.commentTags.forEach(tag => {
          distinctCommentTags.add(tag);
        });

        //add the comment to the 1D array of all comments in order
        this.commentInfo.flattenedComments.push(comment);
      });

      //add the whole group of comments by group
      this.commentInfo.allCommentsInGroups.push(commentGroup.comments);
      //add the comment group position
      this.commentInfo.commentGroupPositions.push(commentGroup.eventSequenceNumber);
    });

    //sort the tags alphabetically
    this.commentInfo.allTags.push(...Array.from(distinctCommentTags).sort());
  }
  
  checkForCommentAtCurrentIndex() {
    //get the most recently played event
    const currentEvent = this.playbackData.events[this.currentEventIndex];

    //if there is a comment at the current event index point
    if (this.playbackData.comments[currentEvent.id]) {
      //landed on an event with at least one comment
      this.mostRecentChanges.endedOnAComment = true;

      //update the current state of the files at the comment (previous state already updated in clearMostRecentChanges())
      this.mostRecentChanges.currentCommentState = this.editorState.getFiles();

      //get all of the comments at this event
      const allCommentsAtCurrentEvent = this.playbackData.comments[currentEvent.id];
      //get the first in the group
      const firstCommentInGroup = allCommentsAtCurrentEvent[0];
      
      //store the selected comment
      this.changeActiveComment(firstCommentInGroup);

      //find the active file to display for this comment
      //default to the file where the event took place (if its a file event, undefined otherwise) 
      let activeFileId = this.activeFileId;//if there is some selected code in any comment in the group then make sure the file is being displayed
      for(let i = 0;i < allCommentsAtCurrentEvent.length;i++) {
        const comment = allCommentsAtCurrentEvent[i];
        if(comment.selectedCodeBlocks.length > 0) {
          //get the file id where there is some selected text
          activeFileId = comment.selectedCodeBlocks[0].fileId;
          break;
        }
      }
      //update the active file (if there is one)
      this.changeActiveFileId(activeFileId);
    } else { //no comment at the current event
      //clear the active comment info
      this.changeActiveComment(null);
    }
  }

  //linear search through all of the comments
  findCommentById(commentId) {
    //the comment with the passed in id
    let retVal = null;

    //go through all of the comment groups
    for(let eventId in this.playbackData.comments) {
      //get all of the comments in the group
      const commentsAtEvent = this.playbackData.comments[eventId];
      
      //search for the comment by id
      for(let i = 0;i < commentsAtEvent.length;i++) {
        if(commentsAtEvent[i].id === commentId) {
          retVal = commentsAtEvent[i];
          break;
        }
      }
    }
    return retVal;
  }

  //finds the position of the event of the next comment
  findNextCommentPosition(startingEventPos) {
    //the position of the next comment
    let retVal = -1;

    //starting just beyond the passed in position look through the event until the end
    for(let i = startingEventPos + 1;i < this.playbackData.events.length;i++) {
      const event = this.playbackData.events[i];
      //if there is a comment at this event
      if(this.playbackData.comments[event.id]) {
        //store the position in the array of events
        retVal = event.eventSequenceNumber;
        break;
      }
    }
    return retVal;
  }

  //finds the position of the event of the previous comment
  findPreviousCommentPosition(startingEventPos) {
    //the position of the previous comment
    let retVal = -1;
    
    //starting just before the passed in position look through the event until the beginning
    for(let i = startingEventPos - 1;i >= 1;i--) {
      const event = this.playbackData.events[i];
      //if there is a comment at this event
      if(this.playbackData.comments[event.id]) {
        //store the position in the array of events
        retVal = event.eventSequenceNumber;
        break;
      }
    }
    return retVal;
  }

  getActiveFileContents() {
    //if there is an active file get its contents
    let activeFileContents = "";
    if(this.activeFileId) {
      activeFileContents = this.editorState.getFile(this.activeFileId);
    }
    return activeFileContents;
  }

  getActiveFilePath() {
    //if there is an active file get the file path
    let filePath = "";
    if(this.activeFileId) {
      filePath = this.editorState.getFilePath(this.activeFileId);
    }
    return filePath;
  }

  haveFilesOtherThanCurrentActiveFileBeenChanged() {
    //if there are no markers then assume no changes (if there are then perform a check)
    let retVal = this.newCodeMarkerGenerator ? true : false;
    if(this.newCodeMarkerGenerator) {
      //get all of the changed files since the last move
      const changedFileIds = this.newCodeMarkerGenerator.getAllChangedFileIds();
      //if there is exactly one file changed and it is the most recent active file
      if(changedFileIds.length === 1 && changedFileIds[0] === this.activeFileId) {
        //there are no changes of the active file
        retVal = false;
      }
    }
    return retVal;
  }

  getNewCodeMarkers() {
    //if there is an active file get the new code markers in it
    let newCodeMarkers = null;
    if(this.activeFileId && this.newCodeMarkerGenerator) {
      newCodeMarkers = this.newCodeMarkerGenerator.getData(this.activeFileId);
    }
    return newCodeMarkers;
  }

  getAllFiles() {
    return this.editorState.allFiles;
  }

  getAllDirectories() {
    return this.editorState.allDirectories;
  }

  handleEvent(currentEvent) {
    //update the editor state 
    if (currentEvent.type === "CREATE DIRECTORY") {
      this.editorState.createDirectory(currentEvent.directoryId, currentEvent.directoryPath, currentEvent.parentDirectoryId);
    } else if (currentEvent.type === "DELETE DIRECTORY") {
      this.editorState.deleteDirectory(currentEvent.directoryId, currentEvent.parentDirectoryId);
    } else if (currentEvent.type === "RENAME DIRECTORY") {
      this.editorState.renameDirectory(currentEvent.directoryId, currentEvent.newDirectoryPath);
    } else if (currentEvent.type === "MOVE DIRECTORY") {
      this.editorState.moveDirectory(currentEvent.directoryId, currentEvent.newDirectoryPath, currentEvent.newParentDirectoryId, currentEvent.oldParentDirectoryId);
    } else if (currentEvent.type === "CREATE FILE") {
      this.editorState.createFile(currentEvent.fileId, currentEvent.filePath, currentEvent.parentDirectoryId);
      
      if(this.newCodeMarkerGenerator) {
        this.newCodeMarkerGenerator.touchFile(currentEvent);
      }
    } else if (currentEvent.type === "DELETE FILE") {
      this.editorState.deleteFile(currentEvent.fileId, currentEvent.parentDirectoryId);
      
      if(this.newCodeMarkerGenerator) {
        this.newCodeMarkerGenerator.touchFile(currentEvent);
      }
    } else if (currentEvent.type === "RENAME FILE") {
      this.editorState.renameFile(currentEvent.fileId, currentEvent.newFilePath);
      
      if(this.newCodeMarkerGenerator) {
        this.newCodeMarkerGenerator.touchFile(currentEvent);
      }
    } else if (currentEvent.type === "MOVE FILE") {
      this.editorState.moveFile(currentEvent.fileId, currentEvent.newFilePath, currentEvent.newParentDirectoryId, currentEvent.oldParentDirectoryId);
    } else if (currentEvent.type === "INSERT") {
      this.editorState.insert(currentEvent.fileId, currentEvent.character, currentEvent.id, currentEvent.lineNumber - 1, currentEvent.column - 1);
      
      if(this.newCodeMarkerGenerator) {
        this.newCodeMarkerGenerator.insert(currentEvent);
      }
    } else if (currentEvent.type === "DELETE") {
      this.editorState.delete(currentEvent.fileId, currentEvent.lineNumber - 1, currentEvent.column - 1);

      if(this.newCodeMarkerGenerator) {
        this.newCodeMarkerGenerator.delete(currentEvent);
      }
    } else {
      throw Error(`Invalid event type: ${currentEvent.type}`);
    }
  }

  handleEventBackward(currentEvent) {
    //update the editor state 
    if (currentEvent.type === "CREATE DIRECTORY") {
      this.editorState.createDirectoryBackward(currentEvent.directoryId, currentEvent.parentDirectoryId);
    } else if (currentEvent.type === "DELETE DIRECTORY") {
      this.editorState.deleteDirectoryBackward(currentEvent.directoryId, currentEvent.parentDirectoryId);
    } else if (currentEvent.type === "RENAME DIRECTORY") {
      this.editorState.renameDirectoryBackward(currentEvent.directoryId, currentEvent.oldDirectoryPath);
    } else if (currentEvent.type === "MOVE DIRECTORY") {
      this.editorState.moveDirectoryBackward(currentEvent.directoryId, currentEvent.oldDirectoryPath, currentEvent.newParentDirectoryId, currentEvent.oldParentDirectoryId,);
    } else if (currentEvent.type === "CREATE FILE") {
      this.editorState.createFileBackward(currentEvent.fileId, currentEvent.parentDirectoryId);
    } else if (currentEvent.type === "DELETE FILE") {
      this.editorState.deleteFileBackward(currentEvent.fileId, currentEvent.parentDirectoryId);
    } else if (currentEvent.type === "RENAME FILE") {
      this.editorState.renameFileBackward(currentEvent.fileId, currentEvent.oldFilePath);
    } else if (currentEvent.type === "MOVE FILE") {
      this.editorState.moveFileBackward(currentEvent.fileId, currentEvent.oldFilePath, currentEvent.newParentDirectoryId, currentEvent.oldParentDirectoryId);
    } else if (currentEvent.type === "INSERT") {
      this.editorState.insertBackward(currentEvent.fileId, currentEvent.lineNumber - 1, currentEvent.column - 1);
    } else if (currentEvent.type === "DELETE") {
      this.editorState.deleteBackward(currentEvent.fileId, currentEvent.character, currentEvent.id, currentEvent.lineNumber - 1, currentEvent.column - 1);
    } else {
      throw Error(`Invalid event type: ${currentEvent.type}`);
    }
  }

  performSearch(searchText) {
    //check for a specialized search: 'comment:searchText', 'code:searchText', 'tag:searchText', 'question:searchText'
    let searchType = 'all';
    const separatorPosition = searchText.indexOf(':');
    let selectedTextEventIds = null;

    if(separatorPosition !== -1) {
      const firstPart = searchText.substring(0, separatorPosition);
      const secondPart = searchText.substring(separatorPosition + 1);
      if(firstPart === 'comment') {
        searchType = firstPart;
        searchText = secondPart;
      } else if(firstPart === 'code') {
        searchType = firstPart;
        searchText = secondPart;
      } else if(firstPart === 'tag') {
        searchType = firstPart;
        searchText = secondPart;
      } else if(firstPart === 'selected-text') {
        searchType = firstPart;
        searchText = secondPart;
        selectedTextEventIds = new Set();
        const ranges = secondPart.split(',');
        for(let i = 0;i < ranges.length;i++) {
          const rangeString = ranges[i];
          const rangeData = this.splitSelectedTextIntoRanges(rangeString);
          const eventIds = this.editorState.getEventIds(this.activeFileId, rangeData.startRow, rangeData.startColumn, rangeData.endRow, rangeData.endColumn);
          for(let j = 0;j < eventIds.length;j++) {
            const eventId = eventIds[j];
            selectedTextEventIds.add(eventId);
          }
        }
      } else if(firstPart === 'question') {
        searchType = firstPart;
        searchText = secondPart;
      }
    }

    //holds all of the search results keyed by comment id
    const searchResults = {
      searchText: searchText,
      numberOfResults: 0,
      details: {}
    };

    //reg ex to remove tags
    const removeHTMLTagsRegEx = /(<([^>]+)>)/ig;
    
    //search all the comments text, code and tags for the matching search text
    for(let eventId in this.playbackData.comments) {
      const commentsAtEvent = this.playbackData.comments[eventId];
      for(let i = 0;i < commentsAtEvent.length;i++) {
        const comment = commentsAtEvent[i];

        let isRelevantComment = false;
        const searchResult = {
          commentId: null,
          inSelectedText: false,
          inCommentText: false,
          inTags: false,
          inQuestion: false,
          searchText: searchText
        };

        if(searchType === 'selected-text') {
          if(comment.selectedCodeBlocks.length > 0) {
            //go through each block of selected code
            comment.selectedCodeBlocks.forEach(block => {
              if(block.selectedTextEventIds) { //older playbacks may not have this
                block.selectedTextEventIds.forEach(selectedCodeEventId => {
                  if(selectedTextEventIds.has(selectedCodeEventId)) {
                    isRelevantComment = true;
                    searchResult.inSelectedText = true;
                    //break;
                  }
                });
              }
            });
          }
        } else {
          //if it is a general search of a specific specialized search
          if(searchType === 'all' || searchType === 'code') {
            comment.selectedCodeBlocks.some(block => {
              if(block.selectedText.toLowerCase().includes(searchText.toLowerCase())) {
                isRelevantComment = true;
                searchResult.inSelectedText = true;
              }
            });
          }

          if(searchType === 'all' || searchType === 'comment') {
            //strip all html and make lowercase
            let cleansedCommentText;
            //if in markdown convert it to html
            if(comment.textFormat && comment.textFormat === 'markdown') {
              const md = markdownit();
              cleansedCommentText = md.render(comment.commentText);
            } else { //not markdown, already in html
              cleansedCommentText = comment.commentText
            }
            cleansedCommentText = cleansedCommentText.replace(removeHTMLTagsRegEx, '').toLowerCase();
            const cleansedCommentTitle = comment.commentTitle.replace(removeHTMLTagsRegEx, '').toLowerCase();
            //check the comment text and the comment title
            if(cleansedCommentText.includes(searchText.toLowerCase()) || cleansedCommentTitle.includes(searchText.toLowerCase())) {
              isRelevantComment = true;
              searchResult.inCommentText = true;
            }
          }

          if(searchType === 'all' || searchType === 'tag') {
            if(comment.commentTags.some(tag => tag.toLowerCase().includes(searchText.toLowerCase()))) {
              isRelevantComment = true;
              searchResult.inTags = true;
            }
          }

          if(searchType === 'all' || searchType === 'question') {
            if(comment.questionCommentData) {
              //strip all html and make lowercase
              const cleansedQuestion = comment.questionCommentData.question.replace(removeHTMLTagsRegEx, '').toLowerCase();
              if(cleansedQuestion.includes(searchText.toLowerCase())) {
                isRelevantComment = true;
                searchResult.inQuestion = true;
              }

              if(comment.questionCommentData.allAnswers.some(answer => answer.toLowerCase().includes(searchText.toLowerCase()))) {
                isRelevantComment = true;
                searchResult.inQuestion = true;
              }
              //strip all html and make lowercase
              const cleansedExplanation = comment.questionCommentData.explanation.replace(removeHTMLTagsRegEx, '').toLowerCase();
              if(comment.questionCommentData.explanation && cleansedExplanation.includes(searchText.toLowerCase())) {
                isRelevantComment = true;
                searchResult.inQuestion = true;
              }
            }
          }
        }

        //collect the comments that have the search text
        if (isRelevantComment){
          //store the comment id
          searchResult.commentId = comment.id;
          //add the search result  
          searchResults.details[comment.id] = searchResult;
          searchResults.numberOfResults++;
        }
      }
    }
    return searchResults;
  }

  splitSelectedTextIntoRanges(rangeString) {
    //split into two parts "line3.1-line4.7"
    const rangeSplit = rangeString.split('-');

    const fromSplit = rangeSplit[0]; //"line3.1"
    const toSplit = rangeSplit[1]; //"line4.7"

    const fromParts = fromSplit.split('.'); //["line3", "1"]
    //filter out the word 'line' and subtract 1 to make it 0 based
    const startRow = Number(fromParts[0].substring('line'.length)) - 1;
    //subtract 1 to make it 0 based
    const startColumn = Number(fromParts[1]) - 1;

    //see above
    const toParts = toSplit.split('.');
    const endRow = Number(toParts[0].substring('line'.length)) - 1;
    const endColumn = Number(toParts[1]) - 1;
    
    return {startRow, startColumn, endRow, endColumn};
  }

  countCommentsInSelection(rangeStrings) {
    //create a set to hold comment ids where some selected text is in the comment
    let commentIds = new Set();

    //go through the array of range strings (ex. ["line3.1-line4.5"])
    for(let i = 0;i < rangeStrings.length;i++)
    {
      const rangeData = this.splitSelectedTextIntoRanges(rangeStrings[i]);
      //get the event ids in the selected range
      const selectedEventIds = this.editorState.getEventIds(this.activeFileId, rangeData.startRow, rangeData.startColumn, rangeData.endRow, rangeData.endColumn);
      
      //collect the comment ids if they belong to a comment
      for(let j = 0;j < selectedEventIds.length;j++) {
        //check to see if the selected event is part of the text in a comment
        if(this.commentInfo.selectedEventIdsFromComments[selectedEventIds[j]]) {
          //store the comment ids only once (dups ignored)
          commentIds.add(this.commentInfo.selectedEventIdsFromComments[selectedEventIds[j]]);
        }
      }
    }
    //return how many distinct comments there are in the selected text
    return commentIds.size;
  }

  replaceAllHTMLWithACharacter(htmlText, character=' ') {
    //reg ex to remove tags
    const removeHTMLTagsRegEx = /(<([^>]+)>)/ig;

    const cleansedString = htmlText.replace(removeHTMLTagsRegEx, (match) => {
      //replace the matched html with the passed in character
      let retVal = '';
      for(let i = 0;i < match.length;i++) {
        retVal += character;
      }
      return retVal;
    });
    return cleansedString;
  }

  surroundHTMLTextWithTag(htmlString, searchText, openingTag, closingTag) {
    //a character that will not show up in a the search text
    const ignoreCharacter = '\0';

    //replace all the html tags with the ignore character
    const strippedAndReplacedHTML = this.replaceAllHTMLWithACharacter(htmlString, ignoreCharacter).toLowerCase();
    const cleansedSearchText = searchText.toLowerCase();
    
    //positions where a match of the search text happened
    const matchPositions = [];
    //go through the entire string of html and look for an exact match
    for(let i = 0;i < strippedAndReplacedHTML.length;i++) {
      //search while ignoring the replaced html tags
      const matchData = this.findMatch(i, strippedAndReplacedHTML, cleansedSearchText, ignoreCharacter);
      if(matchData.match) {
        matchPositions.push(matchData);
        //skip all of the found text to the next possible match
        i = matchData.endPos;
      }
    }

    //if there were any matches move through in reverse so as not to invalidate the match positions
    for(let i = matchPositions.length - 1;i >= 0;i--) {
      const matchData = matchPositions[i];
      
      //build up the new string with the search text wrapped in a new tag
      const firstPart = htmlString.substring(0, matchData.startPos);
      const middlePart = `${openingTag}${htmlString.substring(matchData.startPos, matchData.endPos + 1)}${closingTag}`;
      const endPart = htmlString.substring(matchData.endPos + 1);
      htmlString = firstPart + middlePart + endPart;
    }

    return htmlString;
  }

  findMatch(startPos, strippedAndReplacedHTML, searchText, ignoreCharacter) {
    const retVal = {
      match: false, //assume there was no match
      startPos: -1,
      endPos: Number.MAX_SAFE_INTEGER
    };

    //position to compare in the passed in search text
    let searchTextPos = 0;

    //go through all of the characters in the html
    for(let i = startPos;i < strippedAndReplacedHTML.length;i++) {
      //if it is a character that should be evaluated
      if(strippedAndReplacedHTML.charAt(i) !== ignoreCharacter) {
        //if it does not match the search 
        if(strippedAndReplacedHTML.charAt(i) === searchText[searchTextPos]) {
          //set the starting position of the match if this is the first character found
          retVal.startPos = (retVal.startPos === -1) ? i : retVal.startPos;
          //update the end of the match
          retVal.endPos = i;
          //move to the next character of the search text
          searchTextPos++;
        } else { //at least one character does not match
          break;
        }
        
        //if all of the characters have been found
        if(searchTextPos === searchText.length) {
          //indicate success and stop looking
          retVal.match = true;
          break;
        }
      } //else- ignore the character and move i forward
    }

    return retVal;
  }

  changePlaybackTitle(newTitle) {
    this.playbackData.playbackTitle = newTitle;
  }

  getMostRecentEvent() {
    let retVal = this.playbackData.events[0];
    if(this.currentEventIndex > 0) {
      retVal = this.playbackData.events[this.currentEventIndex];
    }
    return retVal;
  }

  getReadTimeEstimate() {
    return this.playbackData.estimatedReadTime;
  }

  getCommentIndex(commentId) {
    //get the position of the comment in the array of all comments
    let commentIndex = -1;
    for(let i = 0;i < this.commentInfo.flattenedComments.length;i++) {
      if(this.commentInfo.flattenedComments[i].id === commentId) {
        commentIndex = i;
        break;
      }
    }
    return commentIndex;
  }

  addComment(newComment) {
    //get the event id where the playback is paused
    const eventId = this.playbackData.events[this.currentEventIndex].id;
    //if there is not already a comment here
    if(!this.playbackData.comments[eventId]) {
      //create a new array to hold all comments on this event
      this.playbackData.comments[eventId] = [];
      //indicate that there is a new comment group
      this.mostRecentChanges.numberOfCommentGroupsChanged = true;
    }
    //get all of the comments in the group and add the new one
    const commentsAtEvent = this.playbackData.comments[eventId];
    commentsAtEvent.push(newComment);

    //make the new comment the active one
    this.changeActiveComment(newComment);

    //update the aggregate comment info
    this.updateCommentInfo();
  }

  updateComment(originalComment, updatedComment) {
    //get the edited comment's event id 
    const eventId = updatedComment.displayCommentEventId;
    
    //get all of the comments in the group
    const commentsAtEvent = this.playbackData.comments[eventId];
    
    //search for the comment by id
    for(let i = 0;i < commentsAtEvent.length;i++) {
      const comment = commentsAtEvent[i];
      if(comment.id === originalComment.id) {
        //replace the old comment with the new one
        commentsAtEvent[i] = updatedComment;

        //make the edited comment the active one
        this.changeActiveComment(updatedComment);
        break;
      }
    }
    //update the aggregate  comment info
    this.updateCommentInfo();
  }

  deleteComment(deletedComment) {
    //get the deleted comment's event id 
    const eventId = deletedComment.displayCommentEventId;
    
    //get all of the comments in the group
    const commentsAtEvent = this.playbackData.comments[eventId];
    
    //search for the comment by id
    for(let i = 0;i < commentsAtEvent.length;i++) {
      const comment = commentsAtEvent[i];
      if(comment.id === deletedComment.id) {
        //delete the comment
        commentsAtEvent.splice(i, 1);

        //if there are no comments left
        if(commentsAtEvent.length === 0) {
          //delete the empty array at this event
          delete this.playbackData.comments[eventId];
          //indicate that there is one fewer comment group
          this.mostRecentChanges.numberOfCommentGroupsChanged = true;
        }

        //clear out the active comment
        this.changeActiveComment(null);
        break;
      }
    }
    //update the aggregate comment info
    this.updateCommentInfo();
  }

  reorderComments(updatedCommentPosition) {
    //get the group of comments at for an event
    const allCommentsAtEvent = this.playbackData.comments[updatedCommentPosition.eventId];
    //get a reference to the comment being moved
    const movedComment = allCommentsAtEvent[updatedCommentPosition.oldCommentPosition];
    //remove the comment from its original position
    allCommentsAtEvent.splice(updatedCommentPosition.oldCommentPosition, 1);
    //add the comment to its new position
    allCommentsAtEvent.splice(updatedCommentPosition.newCommentPosition, 0, movedComment);
    //mark the moved comment as active
    this.changeActiveComment(movedComment);

    //update the aggregate comment info
    this.updateCommentInfo();
  }
}
