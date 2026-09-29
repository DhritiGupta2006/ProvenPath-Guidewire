package provenpath.pcagent

uses java.io.File
uses java.util.ArrayList
uses java.util.List

/** What an install changed (paths relative to PC_HOME) and where the backup of the previous files is. */
class InstallResult {
  var _backupDir : File as readonly BackupDir
  var _changed : List<String> as readonly Changed = new ArrayList<String>()
  var _created : List<File> as readonly Created = new ArrayList<File>()

  construct(backupDir : File) {
    _backupDir = backupDir
  }
}
